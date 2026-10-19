import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DocumentStatusBadge from "@/pages/documents/components/DocumentStatusBadge";
import DocumentTotals from "@/pages/documents/components/DocumentTotals";
import DocumentLineEditor from "@/pages/documents/components/DocumentLineEditor";
import {
  ALLOCATED_AMOUNT_REQUIRED_CODE,
  DocumentLedgerApiError,
  deleteDocumentLine,
  fetchDocumentDetail,
  linkLineToProduct,
  linkLineWithBreakdown,
  saveDocumentLines,
  unlinkProductManual,
} from "@/pages/documents/lib/documentLedgerApi";
import { getDocumentMatchStatus, lineTotal } from "@/pages/documents/lib/derive";
import {
  DOCUMENT_FILE_KIND_LABELS,
  type DocumentLedgerDocument,
  type DocumentLedgerLine,
} from "@/pages/documents/types";

type LoadState = "loading" | "success" | "error";

interface Message {
  type: "error" | "info" | "success";
  text: string;
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [doc, setDoc] = useState<DocumentLedgerDocument | null>(null);
  const [lines, setLines] = useState<DocumentLedgerLine[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const loadDetail = useCallback(async () => {
    const detail = await fetchDocumentDetail(id ?? "");
    if (!detail) {
      setLoadState("error");
      return;
    }
    setDoc(detail);
    setLines(detail.lines ?? []);
    setLoadState("success");
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setMessage(null);
    fetchDocumentDetail(id ?? "")
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          setLoadState("error");
          return;
        }
        setDoc(detail);
        setLines(detail.lines ?? []);
        setLoadState("success");
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadState("error");
        setMessage({
          type: "error",
          text:
            e instanceof DocumentLedgerApiError
              ? e.message
              : "書類情報を取得できませんでした。",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const currentMatchStatus = doc ? getDocumentMatchStatus(doc) : "unmatched";
  const currentLineTotal = lineTotal(lines);

  // 明細と紐付けを保存（save_document_lines）。
  const handleSave = async () => {
    if (!doc || saveState === "saving") return;
    if (lines.some((l) => !l.description.trim())) {
      setMessage({ type: "error", text: "品目は必須です。すべての明細に入力してください。" });
      return;
    }
    setSaveState("saving");
    setMessage(null);
    try {
      await saveDocumentLines(doc.document_id, lines);
      await loadDetail();
      setMessage({ type: "success", text: "明細を保存しました。" });
    } catch (e) {
      setMessage({
        type: "error",
        text:
          e instanceof DocumentLedgerApiError
            ? e.message
            : "明細の保存に失敗しました。",
      });
    } finally {
      setSaveState("idle");
    }
  };

  // 明細削除（保存済みはサーバー削除、未保存はローカル削除）。
  const handleDeleteLine = async (line: DocumentLedgerLine) => {
    if (!doc) return;
    if (!line.server_id) {
      setLines((prev) => prev.filter((l) => l.line_id !== line.line_id));
      return;
    }
    setBusyLineId(line.line_id);
    setMessage(null);
    try {
      await deleteDocumentLine(line.server_id);
      await loadDetail();
    } catch (e) {
      setMessage({
        type: "error",
        text:
          e instanceof DocumentLedgerApiError
            ? e.message
            : "明細の削除に失敗しました。",
      });
    } finally {
      setBusyLineId(null);
    }
  };

  // 商品の手動紐付け（link_product_manual / linkLineWithBreakdown）。
  const handleLink = async (
    line: DocumentLedgerLine,
    product: { product_id: string; product_name: string },
    allocatedAmountText: string
  ) => {
    if (!doc) return;
    if (!line.server_id) {
      setMessage({ type: "error", text: "先に明細を保存してください。" });
      return;
    }
    setBusyLineId(line.line_id);
    setMessage(null);
    try {
      // ユーザー要求: スタッフが受付番号候補を確認して一度確定するだけで、商品代金と落札手数料が別項目として紐付くようにする
      // 明細行に商品代金税込および落札手数料税込が存在し、割当金額の手動上書きがない場合は自動分離紐付けを実行
      if (
        line.fee_amount_tax_included &&
        line.fee_amount_tax_included > 0 &&
        allocatedAmountText.trim() === ""
      ) {
        const breakdownRes = await linkLineWithBreakdown({
          documentLineId: line.server_id,
          productId: product.product_id,
          itemAmountTaxIncluded: line.item_amount_tax_included,
          feeAmountTaxIncluded: line.fee_amount_tax_included,
          totalLineAmount: line.amount,
          confirmedBy: "staff",
        });

        if (!breakdownRes.isComplete) {
          setMessage({
            type: "error",
            text:
              breakdownRes.error ||
              "内訳の紐付けが一部未完了です。再度確定して修復してください。",
          });
        } else {
          setMessage({
            type: "success",
            text: `商品を紐付けました（商品代: ¥${(
              line.item_amount_tax_included ?? 0
            ).toLocaleString()} / 落札手数料: ¥${line.fee_amount_tax_included.toLocaleString()}）。`,
          });
        }
      } else {
        await linkLineToProduct({
          documentLineId: line.server_id,
          productId: product.product_id,
          allocatedAmount:
            allocatedAmountText.trim() === ""
              ? null
              : Number(allocatedAmountText),
        });
        setMessage({ type: "success", text: "商品を紐付けました。" });
      }
      await loadDetail();
    } catch (e) {
      if (
        e instanceof DocumentLedgerApiError &&
        e.code === ALLOCATED_AMOUNT_REQUIRED_CODE
      ) {
        setMessage({ type: "error", text: "割当金額を入力してください。" });
      } else {
        setMessage({
          type: "error",
          text:
            e instanceof DocumentLedgerApiError
              ? e.message
              : "紐付けに失敗しました。",
        });
      }
    } finally {
      setBusyLineId(null);
    }
  };

  // 紐付け解除（unlink_product_manual）。
  const handleUnlink = async (line: DocumentLedgerLine) => {
    if (!line.link_id && (!line.links || line.links.length === 0)) return;
    setBusyLineId(line.line_id);
    setMessage(null);
    try {
      if (line.links && line.links.length > 0) {
        const activeLinks = line.links.filter(
          (l) => !l.is_deleted && l.status === "confirmed"
        );
        for (const l of activeLinks) {
          await unlinkProductManual(l.id);
        }
      } else if (line.link_id) {
        await unlinkProductManual(line.link_id);
      }
      await loadDetail();
      setMessage({ type: "success", text: "紐付けを解除しました。" });
    } catch (e) {
      setMessage({
        type: "error",
        text:
          e instanceof DocumentLedgerApiError
            ? e.message
            : "紐付けの解除に失敗しました。",
      });
    } finally {
      setBusyLineId(null);
    }
  };

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            to="/documents"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground-600 transition-colors hover:text-primary-600"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            書類一覧
          </Link>
          <span className="text-sm font-semibold text-foreground-950">
            書類詳細
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
        {loadState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <i className="ri-loader-4-line animate-spin text-2xl text-foreground-400"></i>
            <p className="text-sm text-foreground-500">読み込み中...</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <i className="ri-error-warning-line text-2xl w-8 h-8 flex items-center justify-center text-foreground-400"></i>
            <p className="text-sm text-foreground-700">
              {message?.text ?? "書類情報を取得できませんでした"}
            </p>
            <Link
              to="/documents"
              className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              書類一覧に戻る
            </Link>
          </div>
        )}

        {loadState === "success" && doc && (
          <div className="flex flex-col gap-5">
            {/* ファイル情報 */}
            <section className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="break-words text-lg font-semibold leading-snug text-foreground-950">
                    {doc.file_name || "（ファイル名なし）"}
                  </h1>
                  <p className="mt-1 font-mono text-xs text-foreground-500">
                    {doc.document_id}
                  </p>
                </div>
                <DocumentStatusBadge status={currentMatchStatus} />
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <dt className="text-foreground-500">仕入先</dt>
                  <dd className="font-medium text-foreground-800">
                    {doc.supplier_name || "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-foreground-500">種別</dt>
                  <dd className="font-medium text-foreground-800">
                    {DOCUMENT_FILE_KIND_LABELS[doc.file_kind] ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-foreground-500">アップロード日時</dt>
                  <dd className="font-medium text-foreground-800">
                    {formatDateTime(doc.uploaded_at)}
                  </dd>
                </div>
              </dl>

              {/* Drive原本を開くリンク */}
              <div className="mt-3 border-t border-background-100 pt-3">
                {doc.drive_url ? (
                  <a
                    href={doc.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
                  >
                    <i className="ri-external-link-line w-4 h-4 flex items-center justify-center"></i>
                    Drive原本を開く
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-200 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-400">
                    <i className="ri-link-unlink w-4 h-4 flex items-center justify-center"></i>
                    Drive原本を開く（原本リンクなし）
                  </span>
                )}
              </div>
            </section>

            {/* 原本合計・明細合計・差額 */}
            <section className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-foreground-950">
                <i className="ri-scales-3-line w-4 h-4 flex items-center justify-center text-primary-600"></i>
                合計と差額
              </h2>
              <DocumentTotals
                originalTotal={doc.original_total}
                lineTotalValue={currentLineTotal}
              />
            </section>

            {/* 明細行（追加・修正・手動紐付け） */}
            <section className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
              <DocumentLineEditor
                lines={lines}
                onChange={setLines}
                onDeleteLine={handleDeleteLine}
                onLink={handleLink}
                onUnlink={handleUnlink}
                busyLineId={busyLineId}
              />
            </section>

            {/* 保存 */}
            <section className="rounded-lg border border-background-200 bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveState === "saving"}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveState === "saving" ? (
                    <>
                      <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                      保存中...
                    </>
                  ) : (
                    <>
                      <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
                      明細を保存
                    </>
                  )}
                </button>
                <span className="text-[11px] text-foreground-400">
                  OCR・自動照合は行いません。明細と紐付けは手動で登録します。商品の紐付けは明細の保存後に行えます。
                </span>
              </div>

              {message && (
                <p
                  className={`mt-3 flex items-start gap-1.5 rounded-md border px-3 py-2 text-[12px] leading-relaxed ${
                    message.type === "error"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : message.type === "success"
                        ? "border-primary-200 bg-primary-50 text-primary-800"
                        : "border-secondary-200 bg-secondary-50 text-secondary-900"
                  }`}
                >
                  <i
                    className={`${
                      message.type === "error"
                        ? "ri-error-warning-line"
                        : "ri-checkbox-circle-line"
                    } mt-0.5 w-4 h-4 flex items-center justify-center shrink-0`}
                  ></i>
                  <span className="min-w-0 flex-1">{message.text}</span>
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
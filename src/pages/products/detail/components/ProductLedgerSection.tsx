import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  DocumentLedgerApiError,
  unlinkProductManual,
} from "@/pages/documents/lib/documentLedgerApi";
import type {
  ProductCostDetail,
  ProductCostLinkDetail,
} from "@/pages/documents/lib/documentLedgerApi";
import type { ProductCostLoadState } from "../hooks/useProductCostDetail";
import { deriveProductCost } from "../lib/productCost";
import { formatYen } from "../lib/format";
import CataloguePanelHeading from "./CataloguePanelHeading";
import ProductLedgerLinker from "./ProductLedgerLinker";

interface ProductLedgerSectionProps {
  productId: string;
  productName?: string;
  // 販売予定価格（想定粗利の算出に使う。未設定なら粗利は表示しない）
  plannedSalePrice: number | null | undefined;
  costDetail: ProductCostDetail | null;
  costLoadState: ProductCostLoadState;
  costErrorText: string;
  // 紐付け確定・解除のあとに原価を取り直す（上部の表示も同時に更新する）
  onReloadCost: () => void;
  autoLinkNotice?: AutoLinkNotice | null;
  onDismissAutoLinkNotice?: () => void;
}

export interface AutoLinkNotice {
  tone: "success" | "warning" | "error";
  text: string;
  // 既存の「明細を探して紐付け」へ進むべきか（自動では紐付けていない）
  needsManualLink: boolean;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  primary_cost: "商品代金",
  commission: "落札手数料",
  additional_fee: "追加手数料",
  shipping_cost: "送料",
  other_expense: "その他経費",
  refund: "返金・値引き",
  sale_settlement: "売上精算",
};

const ROW =
  "flex flex-col gap-1.5 border-b border-[var(--cat-rule-soft)] py-3 sm:flex-row sm:items-baseline sm:gap-6";
const LABEL_CELL =
  "w-full shrink-0 text-[10px] leading-5 tracking-[0.18em] text-[var(--cat-ink-soft)] sm:w-[104px]";
const ACTION_LINK =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border-b border-transparent pb-0.5 text-[10.5px] tracking-[0.1em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-rule)] hover:text-[var(--cat-ink)]";
const ACTION_UNLINK =
  "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border-b border-transparent pb-0.5 text-[10.5px] tracking-[0.1em] text-[#8f3f34] transition-colors hover:border-[#8f3f34]";

function uniqueText(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = (value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

/** 2026-10-12 → 2026.10.12（図録の日付表記） */
function formatDate(value: string): string {
  const text = value.trim();
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return text;
  return `${matched[1]}.${matched[2]}.${matched[3]}`;
}

/** 罫線テーブルの1行（左に小さな項目名、右に値） */
function Row({
  label,
  children,
  align = "right",
}: {
  label: string;
  children: ReactNode;
  align?: "right" | "left";
}) {
  return (
    <div className={ROW}>
      <dt className={LABEL_CELL}>{label}</dt>
      <dd
        className={`min-w-0 flex-1 text-[12.5px] leading-[1.8] text-[var(--cat-ink)] ${
          align === "right" ? "sm:text-right" : "text-left"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

/** 紐付け書類1件（見出し行＋必要なときだけ明細と操作を開く） */
function DocumentRow({
  link,
  expanded,
  onToggle,
  confirming,
  busy,
  onAskUnlink,
  onCancelUnlink,
  onConfirmUnlink,
}: {
  link: ProductCostLinkDetail;
  expanded: boolean;
  onToggle: () => void;
  confirming: boolean;
  busy: boolean;
  onAskUnlink: () => void;
  onCancelUnlink: () => void;
  onConfirmUnlink: () => void;
}) {
  const fileName = (link.document_file_name ?? "").trim();
  const itemName = (link.item_name ?? "").trim();
  const primaryTitle = fileName || itemName || "（品目なし）";
  const typeLabel = LINK_TYPE_LABELS[link.link_type] ?? link.link_type;

  return (
    <li className="border-b border-[var(--cat-rule-soft)] py-2.5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 text-left">
          <p
            className="min-w-0 truncate text-[12px] leading-snug text-[var(--cat-ink)]"
            title={primaryTitle}
          >
            {primaryTitle}
          </p>
          <p className="cat-mono mt-1 flex flex-wrap items-center gap-x-2 text-[9px] tracking-[0.12em] text-[var(--cat-ink-soft)]">
            <span className="text-[var(--cat-green)]">照合済</span>
            <span>{typeLabel}</span>
            {link.document_number && <span>{link.document_number}</span>}
            {link.issue_date && <span>{formatDate(link.issue_date)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="cat-mono whitespace-nowrap text-[12px] leading-none text-[var(--cat-ink)]">
            {formatYen(link.total_line_amount)}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="cat-mono cursor-pointer whitespace-nowrap border-b border-transparent pb-0.5 text-[9.5px] tracking-[0.12em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-rule)] hover:text-[var(--cat-ink)]"
          >
            {expanded ? "閉じる" : "明細"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="tab-fade mt-2.5 border-t border-[var(--cat-rule-soft)] pt-2.5">
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[10.5px] leading-[1.7] text-[var(--cat-ink-soft)]">
            {link.reception_number && (
              <div className="inline-flex items-baseline gap-1">
                <dt>受付番号</dt>
                <dd className="cat-mono text-[var(--cat-ink)]">
                  {link.reception_number}
                </dd>
              </div>
            )}
            {link.supplier_name && (
              <div className="inline-flex min-w-0 items-baseline gap-1">
                <dt>仕入先</dt>
                <dd className="truncate text-[var(--cat-ink)]">
                  {link.supplier_name}
                </dd>
              </div>
            )}
          </dl>

          <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[10.5px]">
            <div className="inline-flex items-baseline gap-1">
              <dt className="text-[var(--cat-ink-soft)]">商品代金</dt>
              <dd className="cat-mono text-[var(--cat-ink)]">
                {formatYen(link.item_amount)}
              </dd>
            </div>
            <div className="inline-flex items-baseline gap-1">
              <dt className="text-[var(--cat-ink-soft)]">落札手数料</dt>
              <dd className="cat-mono text-[var(--cat-ink)]">
                {formatYen(link.fee_amount)}
              </dd>
            </div>
            <div className="inline-flex items-baseline gap-1">
              <dt className="text-[var(--cat-ink-soft)]">明細（税込）</dt>
              <dd className="cat-mono text-[var(--cat-ink)]">
                {formatYen(link.total_line_amount)}
              </dd>
            </div>
          </dl>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {link.drive_url ? (
              <a
                href={link.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className={ACTION_LINK}
              >
                <i className="ri-file-pdf-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                原本PDF
              </a>
            ) : (
              <span className="inline-flex cursor-default items-center gap-1 whitespace-nowrap text-[10.5px] tracking-[0.1em] text-[var(--cat-rule)]">
                <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                原本なし
              </span>
            )}
            {link.document_id && (
              <Link to={`/documents/${link.document_id}`} className={ACTION_LINK}>
                <i className="ri-file-text-line w-3.5 h-3.5 flex items-center justify-center"></i>
                書類詳細
              </Link>
            )}
            {!confirming && (
              <button type="button" onClick={onAskUnlink} className={ACTION_UNLINK}>
                <i className="ri-link-unlink w-3.5 h-3.5 flex items-center justify-center"></i>
                紐付けを解除
              </button>
            )}
          </div>

          {confirming && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border border-[#dcc0b9] px-3 py-2">
              <p className="text-[11px] leading-relaxed text-[#8f3f34]">
                この書類の紐付けを解除しますか？
              </p>
              <span className="min-w-0 flex-1" />
              <button
                type="button"
                onClick={onConfirmUnlink}
                disabled={busy}
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border border-[#8f3f34] px-2.5 py-1 text-[10px] tracking-[0.1em] text-[#8f3f34] transition-colors hover:bg-[#8f3f34] hover:text-[var(--cat-paper)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && (
                  <i className="ri-loader-4-line animate-spin w-3 h-3 flex items-center justify-center"></i>
                )}
                解除する
              </button>
              <button
                type="button"
                onClick={onCancelUnlink}
                disabled={busy}
                className="inline-flex cursor-pointer items-center whitespace-nowrap border-b border-transparent pb-0.5 text-[10px] tracking-[0.1em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-rule)] hover:text-[var(--cat-ink)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                やめる
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * 商品詳細の「来歴・仕入」。
 *
 * 仕入先・請求日・受付番号・仕入書類（照合状態つき）・仕入内訳・仕入原価・想定粗利を
 * 罫線だけのテーブルに1行ずつ並べる（白カード・角丸・グラフは使わない）。
 * 金額と日付は等幅フォント。値の集計は deriveProductCost に任せ、
 * 商品詳細ページが1回だけ取得した結果（上部サマリーと同じ）を使う。
 */
export default function ProductLedgerSection({
  productId,
  productName,
  plannedSalePrice,
  costDetail,
  costLoadState,
  costErrorText,
  onReloadCost,
  autoLinkNotice = null,
  onDismissAutoLinkNotice,
}: ProductLedgerSectionProps) {
  const [linkerOpen, setLinkerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState("");
  const [notice, setNotice] = useState("");

  const retry = useCallback(() => onReloadCost(), [onReloadCost]);

  const handleUnlink = useCallback(
    async (linkId: string) => {
      setUnlinkBusy(linkId);
      setUnlinkError("");
      setNotice("");
      try {
        await unlinkProductManual(linkId);
        setUnlinkTarget(null);
        setNotice("紐付けを解除しました。");
        onReloadCost();
      } catch (e: unknown) {
        setUnlinkError(
          e instanceof DocumentLedgerApiError
            ? e.message
            : "紐付けの解除に失敗しました。時間をおいて再度お試しください。"
        );
      } finally {
        setUnlinkBusy(null);
      }
    },
    [onReloadCost]
  );

  const cost = deriveProductCost(costDetail);
  const links = costDetail?.links ?? [];
  const loading = costLoadState === "loading";
  const errorText = costLoadState === "error" ? costErrorText : "";
  const show = cost.hasLinks && !loading;

  const plannedPrice = Number(plannedSalePrice) || 0;
  const canShowProfit = plannedPrice > 0 && cost.hasLinks;
  const profit = plannedPrice - cost.costTotal;
  const profitRate = plannedPrice > 0 ? (profit / plannedPrice) * 100 : 0;

  const suppliers = uniqueText(links.map((link) => link.supplier_name));
  const issueDates = uniqueText(links.map((link) => link.issue_date));
  const receptionNumbers = uniqueText(links.map((link) => link.reception_number));

  const joinOrDash = (values: string[], formatter?: (v: string) => string) =>
    values.length > 0
      ? values.map((value) => (formatter ? formatter(value) : value)).join(" / ")
      : "—";

  // 表に出す内訳（0円の行は出さない）
  const breakdown: Array<{ label: string; value: number }> = [];
  if (show && cost.hasItemBreakdown && cost.itemTotal !== 0) {
    breakdown.push({ label: "商品代金", value: cost.itemTotal });
  }
  if (show && cost.hasFeeBreakdown && cost.feeTotal !== 0) {
    breakdown.push({ label: "落札手数料", value: cost.feeTotal });
  }
  if (show && cost.hasTaxBreakdown && cost.taxTotal !== 0) {
    breakdown.push({ label: "税額", value: cost.taxTotal });
  }
  if (show && cost.otherTotal > 0) {
    breakdown.push({ label: "送料・その他", value: cost.otherTotal });
  }
  if (show && cost.hasUnknownBreakdown) {
    breakdown.push({ label: "内訳未取得", value: cost.unknownBreakdownTotal });
  }

  return (
    <section>
      <CataloguePanelHeading
        title="来歴・仕入"
        eyebrow="Provenance & Purchase"
        right={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="cat-mono text-[9px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
              {loading ? "LOADING" : `${links.length} DOCUMENTS`}
            </span>
            <button
              type="button"
              onClick={() => {
                setLinkerOpen((open) => !open);
                setNotice("");
                setUnlinkError("");
              }}
              aria-expanded={linkerOpen}
              className="cat-mono inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border border-[var(--cat-ink)] px-3 py-1.5 text-[10px] tracking-[0.12em] text-[var(--cat-ink)] transition-colors hover:bg-[var(--cat-ink)] hover:text-[var(--cat-paper)]"
            >
              <i
                className={`${
                  linkerOpen ? "ri-close-line" : "ri-link-m"
                } w-3.5 h-3.5 flex items-center justify-center`}
              ></i>
              {linkerOpen ? "閉じる" : "明細を探して紐付け"}
            </button>
          </div>
        }
      />

      {/* 自動照合の結果（登録・編集の成否とは別に表示する） */}
      {autoLinkNotice && (
        <div
          className="mt-4 border-l-2 border-[var(--cat-rule)] pl-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-[11.5px] leading-[1.9] text-[var(--cat-ink)]">
            {autoLinkNotice.text}
          </p>
          {autoLinkNotice.needsManualLink && (
            <p className="mt-1 text-[10.5px] leading-[1.8] text-[var(--cat-ink-soft)]">
              自動で別の明細を選んだり、既存の紐付けを付け替えたりはしていません。上の「明細を探して紐付け」から手動で紐付けてください。
            </p>
          )}
          {onDismissAutoLinkNotice && (
            <button
              type="button"
              onClick={onDismissAutoLinkNotice}
              className="cat-mono mt-2 cursor-pointer border-b border-transparent pb-0.5 text-[9.5px] tracking-[0.14em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-rule)] hover:text-[var(--cat-ink)]"
            >
              閉じる
            </button>
          )}
        </div>
      )}

      {(notice || unlinkError) && (
        <div className="mt-3 flex flex-col gap-1">
          {notice && (
            <p className="text-[11px] leading-relaxed text-[var(--cat-green)]">
              {notice}
            </p>
          )}
          {unlinkError && (
            <p className="text-[11px] leading-relaxed text-[#8f3f34]">
              {unlinkError}
            </p>
          )}
        </div>
      )}

      <dl className="mt-4 border-t border-[var(--cat-rule-soft)]">
        <Row label="仕入先">{joinOrDash(suppliers)}</Row>
        <Row label="請求日">
          <span className="cat-mono text-[12px]">
            {joinOrDash(issueDates, formatDate)}
          </span>
        </Row>
        <Row label="受付番号">
          <span className="cat-mono text-[12px]">
            {joinOrDash(receptionNumbers)}
          </span>
        </Row>

        {/* 仕入書類（照合状態を含む） */}
        <Row label="仕入書類" align="left">
          {loading && (
            <p className="cat-mono text-[10.5px] tracking-[0.12em] text-[var(--cat-ink-soft)]">
              読み込み中...
            </p>
          )}

          {!loading && errorText && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--cat-ink-soft)]">
                {errorText}
              </p>
              <button
                type="button"
                onClick={retry}
                className="cat-mono inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border border-[var(--cat-rule)] px-2.5 py-1 text-[9.5px] tracking-[0.12em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-ink)] hover:text-[var(--cat-ink)]"
              >
                <i className="ri-refresh-line w-3 h-3 flex items-center justify-center"></i>
                再読み込み
              </button>
            </div>
          )}

          {!loading && !errorText && links.length === 0 && (
            <p className="text-[11px] leading-[1.9] text-[var(--cat-ink-soft)]">
              紐付いた書類明細はありません。「明細を探して紐付け」から受付番号・品目で検索して紐付けてください。
            </p>
          )}

          {!loading && !errorText && links.length > 0 && (
            <ul className="border-t border-[var(--cat-rule-soft)]">
              {links.map((link) => (
                <DocumentRow
                  key={link.link_id}
                  link={link}
                  expanded={expandedIds.includes(link.link_id)}
                  onToggle={() =>
                    setExpandedIds((prev) =>
                      prev.includes(link.link_id)
                        ? prev.filter((id) => id !== link.link_id)
                        : [...prev, link.link_id]
                    )
                  }
                  confirming={unlinkTarget === link.link_id}
                  busy={unlinkBusy === link.link_id}
                  onAskUnlink={() => {
                    setUnlinkTarget(link.link_id);
                    setUnlinkError("");
                    setNotice("");
                  }}
                  onCancelUnlink={() => setUnlinkTarget(null)}
                  onConfirmUnlink={() => void handleUnlink(link.link_id)}
                />
              ))}
            </ul>
          )}
        </Row>

        {/* 仕入内訳（グラフは使わず、数字の行だけで示す） */}
        <Row label="仕入内訳">
          {show && breakdown.length > 0 ? (
            <dl className="flex flex-col gap-1">
              {breakdown.map((item) => (
                <div
                  key={item.label}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="text-[10px] tracking-[0.12em] text-[var(--cat-ink-soft)]">
                    {item.label}
                  </dt>
                  <dd className="cat-mono whitespace-nowrap text-[12px] text-[var(--cat-ink)]">
                    {formatYen(item.value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <span className="text-[11px] text-[var(--cat-ink-soft)]">
              {!show && !loading
                ? "紐付いた書類がないため、金額はまだ集計されていません。"
                : "—"}
            </span>
          )}
        </Row>

        <Row label="仕入原価">
          <span className="cat-mono text-[14px] tracking-[0.02em] text-[var(--cat-ink)]">
            {show && cost.hasCostAmount ? formatYen(cost.costTotal) : "—"}
          </span>
          <span className="cat-mono ml-2 text-[9px] tracking-[0.14em] text-[var(--cat-ink-soft)]">
            概算
          </span>
        </Row>

        <Row label="想定粗利">
          {show && canShowProfit ? (
            <span className="cat-mono whitespace-nowrap text-[13px]">
              <span
                className={
                  profit >= 0
                    ? "text-[var(--cat-green)]"
                    : "text-[#8f3f34]"
                }
              >
                {formatYen(profit)}
              </span>
              <span className="ml-3 text-[10.5px] tracking-[0.08em] text-[var(--cat-ink-soft)]">
                （粗利率 {profitRate.toFixed(1)}%）
              </span>
            </span>
          ) : (
            <span className="text-[11px] text-[var(--cat-ink-soft)]">
              {show
                ? "販売予定価格が未設定のため、想定粗利は算出していません。"
                : "—"}
            </span>
          )}
        </Row>
      </dl>

      {/* 誤解を避けるための注記（表の外に小さく置く） */}
      {show && (
        <div className="mt-3 flex flex-col gap-1 text-[10px] leading-[1.9] text-[var(--cat-ink-soft)]">
          {cost.otherTotal > 0 && (
            <p>※ 送料・その他経費を仕入原価に含めています。</p>
          )}
          {cost.hasUnknownBreakdown && (
            <p>
              ※ 内訳（商品代金・落札手数料）が未取得の明細が{" "}
              <span className="cat-mono">
                {formatYen(cost.unknownBreakdownTotal)}
              </span>{" "}
              あります。この金額は商品代金には含めず、仕入原価にのみ算入しています。
            </p>
          )}
          <p>
            ※ 税額の確認が取れていない明細がある場合、金額は税込・税抜の厳密な配分を行わない概算です。
          </p>
        </div>
      )}

      {linkerOpen && (
        <div className="tab-fade mt-5 border border-[var(--cat-rule-soft)] px-3.5 py-3.5 md:px-4">
          <ProductLedgerLinker
            productId={productId}
            productName={productName}
            onChanged={() => {
              setNotice("仕入明細を紐付けました。");
              setUnlinkTarget(null);
              setUnlinkError("");
              onReloadCost();
            }}
          />
        </div>
      )}
    </section>
  );
}
import { useEffect, useState } from "react";
import SupplyLineSearchResults from "./SupplyLineSearchResults";
import {
  DocumentLedgerApiError,
  searchDocumentLines,
} from "@/pages/documents/lib/documentLedgerApi";
import type { DocumentLineSearchHit } from "@/pages/documents/types";

type SearchState = "idle" | "loading" | "success" | "empty" | "error";

const fieldClass =
  "h-9 w-full rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200";

interface SupplyLineSearchProps {
  // 検索結果（または0件結果）を表示中かどうかを親へ通知する。
  // 親は書類一覧を折りたたみ、検索結果の確認に集中できるようにする。
  onActiveChange?: (active: boolean) => void;
}

/**
 * 書類管理画面の主役となる「仕入明細を探す」検索パネル。
 *
 * - 受付番号（部分一致）と キーワード（品名・ブランド・仕入先・書類名）の2軸。
 * - 片方だけでも検索でき、両方入力した場合は AND で絞り込む。
 * - Enter または検索ボタンで実行する。
 */
export default function SupplyLineSearch({
  onActiveChange,
}: SupplyLineSearchProps) {
  const [receptionNumber, setReceptionNumber] = useState("");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [hits, setHits] = useState<DocumentLineSearchHit[]>([]);
  const [errorText, setErrorText] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [applied, setApplied] = useState<{ reception: string; keyword: string }>({
    reception: "",
    keyword: "",
  });

  const hasInput = receptionNumber.trim() !== "" || keyword.trim() !== "";

  // 検索結果が出ている間だけ一覧を折りたたませる（エラー・待機時は通常表示のまま）。
  const isActive = state === "success" || state === "empty";
  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  const runSearch = async () => {
    if (!hasInput || state === "loading") return;
    setState("loading");
    setErrorText("");
    try {
      const rows = await searchDocumentLines({
        receptionNumber,
        keyword,
      });
      setHits(rows);
      setApplied({
        reception: receptionNumber.trim(),
        keyword: keyword.trim(),
      });
      setState(rows.length > 0 ? "success" : "empty");
    } catch (e) {
      setHits([]);
      setErrorText(
        e instanceof DocumentLedgerApiError
          ? e.message
          : "明細の検索に失敗しました。時間をおいて再度お試しください。"
      );
      setState("error");
    }
  };

  const resetAll = () => {
    setReceptionNumber("");
    setKeyword("");
    setHits([]);
    setApplied({ reception: "", keyword: "" });
    setState("idle");
    setErrorText("");
  };

  // 適用中の検索条件チップ（検索後・0件時に表示する）
  const appliedChips =
    applied.reception || applied.keyword ? (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-foreground-400">検索条件</span>
        {applied.reception && (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-background-300 bg-white px-1.5 py-0.5 text-[11px] text-foreground-700">
            <span className="text-foreground-400">受付番号</span>
            <span className="truncate font-mono tabular-nums">
              {applied.reception}
            </span>
          </span>
        )}
        {applied.keyword && (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-background-300 bg-white px-1.5 py-0.5 text-[11px] text-foreground-700">
            <span className="text-foreground-400">キーワード</span>
            <span className="truncate">{applied.keyword}</span>
          </span>
        )}
        {applied.reception && applied.keyword && (
          <span className="text-[11px] text-foreground-400">
            両条件に一致
          </span>
        )}
      </div>
    ) : null;

  return (
    <section className="rounded-lg border border-background-200 bg-white px-3 py-3 md:px-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-foreground-950">
          <i className="ri-search-eye-line w-4 h-4 flex items-center justify-center text-foreground-500"></i>
          仕入明細を探す
        </h2>
        <button
          type="button"
          aria-expanded={helpOpen}
          aria-label="検索対象の説明を開く"
          onClick={() => setHelpOpen((prev) => !prev)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-800"
        >
          <i
            className={`${
              helpOpen ? "ri-information-fill" : "ri-information-line"
            } w-3.5 h-3.5 flex items-center justify-center`}
          ></i>
          検索対象
        </button>
      </div>

      {helpOpen && (
        <div className="mt-2 rounded-md border border-background-200 bg-background-50 px-3 py-2 text-[11px] leading-relaxed text-foreground-600">
          <p>
            <span className="font-medium text-foreground-800">受付番号</span>
            ：部分一致で検索します。
          </p>
          <p className="mt-0.5">
            <span className="font-medium text-foreground-800">キーワード</span>
            ：品名・ブランド・仕入先・書類名から検索します。
          </p>
          <p className="mt-0.5">
            両方入力した場合は、両方に一致する明細のみを表示します。
          </p>
        </div>
      )}

      <form
        className="mt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={receptionNumber}
            onChange={(e) => setReceptionNumber(e.target.value)}
            placeholder="受付番号（例：875-37916）"
            aria-label="受付番号で検索"
            className={`${fieldClass} font-mono sm:w-[210px] sm:shrink-0`}
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード（品名・ブランド・仕入先・書類名）"
            aria-label="キーワードで検索"
            className={`${fieldClass} sm:min-w-0 sm:flex-1`}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="submit"
              disabled={!hasInput || state === "loading"}
              className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 text-sm font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {state === "loading" ? (
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              ) : (
                <i className="ri-search-line w-4 h-4 flex items-center justify-center"></i>
              )}
              {state === "loading" ? "検索中" : "検索"}
            </button>
            {(hasInput || state !== "idle") && (
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-background-300 bg-white px-3 text-xs font-medium text-foreground-600 transition-colors hover:bg-background-100"
              >
                <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center"></i>
                条件をクリア
              </button>
            )}
          </div>
        </div>
      </form>

      <div>
        {state === "error" && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
            <span className="min-w-0 flex-1">{errorText}</span>
          </p>
        )}

        {state === "empty" && (
          <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-background-300 bg-white px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground-800">
              <i className="ri-search-line w-4 h-4 flex items-center justify-center text-foreground-500"></i>
              該当する仕入明細がありません
            </p>
            <p className="text-[11px] leading-relaxed text-foreground-500">
              受付番号やキーワードを変えて、もう一度検索してください。書類名の一部やブランド名だけでも探せます。
            </p>
            {appliedChips}
          </div>
        )}

        {state === "success" && (
          <div className="mt-2.5">
            <div className="mb-1.5">{appliedChips}</div>
            <SupplyLineSearchResults hits={hits} />
          </div>
        )}
      </div>
    </section>
  );
}
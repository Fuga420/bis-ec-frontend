import { useState } from "react";
import SupplyLineSearchResults from "./SupplyLineSearchResults";
import {
  DocumentLedgerApiError,
  searchDocumentLines,
} from "@/pages/documents/lib/documentLedgerApi";
import type { DocumentLineSearchHit } from "@/pages/documents/types";

type SearchState = "idle" | "loading" | "success" | "empty" | "error";

const fieldClass =
  "h-11 w-full rounded-lg border border-background-300 bg-white px-3 text-sm text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200";

/**
 * 書類管理画面の主役となる「仕入明細を探す」検索パネル。
 *
 * - 受付番号（部分一致）と ことば（品目・ブランド・仕入先・書類名）の2軸。
 * - 片方だけでも検索でき、両方入力した場合は AND で絞り込む。
 * - Enter または検索ボタンで実行する。
 */
export default function SupplyLineSearch() {
  const [receptionNumber, setReceptionNumber] = useState("");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [hits, setHits] = useState<DocumentLineSearchHit[]>([]);
  const [errorText, setErrorText] = useState("");
  const [applied, setApplied] = useState<{ reception: string; keyword: string }>({
    reception: "",
    keyword: "",
  });

  const hasInput =
    receptionNumber.trim() !== "" || keyword.trim() !== "";

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

  return (
    <section className="rounded-lg border border-background-200 bg-white">
      <div className="border-b border-background-100 px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-foreground-950">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-primary-700">
              <i className="ri-search-eye-line w-4 h-4 flex items-center justify-center"></i>
            </span>
            仕入明細を探す
          </h2>
          <p className="text-[11px] text-foreground-400">
            受付番号・ことばのどちらか一方でも検索できます
          </p>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-500">
          受付番号は部分一致、ことばは品目・ブランド・仕入先・書類名から探します。両方入力すると絞り込みます。
        </p>
      </div>

      <form
        className="px-4 py-3.5 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-medium text-foreground-600">
              <i className="ri-hashtag w-3.5 h-3.5 flex items-center justify-center text-secondary-700"></i>
              受付番号（部分一致）
            </span>
            <input
              type="text"
              value={receptionNumber}
              onChange={(e) => setReceptionNumber(e.target.value)}
              placeholder="例: 875-37916"
              aria-label="受付番号で検索"
              className={`${fieldClass} font-mono`}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-medium text-foreground-600">
              <i className="ri-text w-3.5 h-3.5 flex items-center justify-center text-secondary-700"></i>
              ことばで検索
            </span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例: ダイヤモンド / オークネット / 計算書"
              aria-label="ことばで検索"
              className={fieldClass}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!hasInput || state === "loading"}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "loading" ? (
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
            ) : (
              <i className="ri-search-line w-4 h-4 flex items-center justify-center"></i>
            )}
            {state === "loading" ? "検索中..." : "検索"}
          </button>
          {(hasInput || state !== "idle") && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-background-300 bg-white px-3.5 py-2.5 text-xs font-medium text-foreground-600 transition-colors hover:bg-background-100"
            >
              <i className="ri-refresh-line w-3.5 h-3.5 flex items-center justify-center"></i>
              条件をクリア
            </button>
          )}
          <span className="ml-auto hidden text-[11px] text-foreground-400 sm:block">
            Enter キーでも検索できます
          </span>
        </div>
      </form>

      <div className="px-4 pb-4 md:px-5">
        {state === "error" && (
          <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center shrink-0"></i>
            <span className="min-w-0 flex-1">{errorText}</span>
          </p>
        )}

        {state === "empty" && (
          <div className="flex flex-col gap-1 rounded-lg border border-background-200 bg-background-50 px-3.5 py-4">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground-700">
              <i className="ri-inbox-line w-4 h-4 flex items-center justify-center"></i>
              条件に一致する明細は見つかりませんでした
            </p>
            <p className="text-[11px] leading-relaxed text-foreground-500">
              {applied.reception && applied.keyword
                ? "受付番号とことばの両方に一致する明細がありません。どちらかを空にして再検索してください。"
                : "受付番号の桁や、ことばの表記（カナ・記号）を変えて試してください。"}
            </p>
          </div>
        )}

        {state === "success" && (
          <>
            <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-400">
              <span>検索条件:</span>
              {applied.reception && (
                <span className="rounded bg-secondary-100 px-1.5 py-0.5 font-mono text-secondary-900">
                  受付番号 {applied.reception}
                </span>
              )}
              {applied.keyword && (
                <span className="rounded bg-secondary-100 px-1.5 py-0.5 text-secondary-900">
                  ことば {applied.keyword}
                </span>
              )}
              {applied.reception && applied.keyword && (
                <span>（両条件に一致）</span>
              )}
            </p>
            <SupplyLineSearchResults hits={hits} onClear={resetAll} />
          </>
        )}

        {state === "idle" && (
          <p className="flex items-center gap-1.5 rounded-md border border-dashed border-background-300 bg-background-50 px-3 py-2.5 text-[11px] text-foreground-500">
            <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center"></i>
            受付番号が分かる場合はそのまま入力。分からない場合は品目や仕入先の一部を「ことば」に入れてください。
          </p>
        )}
      </div>
    </section>
  );
}
import { useState } from "react";
import { searchProductsById } from "@/pages/documents/lib/productSearch";
import type { AdminProduct } from "@/pages/products/types";

interface ProductLinkSearchProps {
  onSelect: (product: { product_id: string; product_name: string }) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

type SearchState = "idle" | "loading" | "success" | "empty" | "error";

function formatYen(value: number): string {
  return `¥${(Number(value) || 0).toLocaleString("ja-JP")}`;
}

/**
 * 商品ID検索と手動紐付けの検索UI。
 * 検索は既存の商品一覧API（mode=admin）を再利用する（新しいAPIは追加しない）。
 */
export default function ProductLinkSearch({
  onSelect,
  onCancel,
  disabled = false,
}: ProductLinkSearchProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<AdminProduct[]>([]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setState("idle");
      setResults([]);
      return;
    }
    setState("loading");
    try {
      const list = await searchProductsById(q);
      setResults(list);
      setState(list.length > 0 ? "success" : "empty");
    } catch {
      setResults([]);
      setState("error");
    }
  };

  return (
    <div className="rounded-lg border border-background-300 bg-background-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 flex items-center justify-center text-sm text-foreground-400"></i>
          <input
            type="text"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="商品IDで検索（例: TMP-000117）"
            aria-label="商品IDで検索"
            className="h-9 w-full rounded-md border border-background-300 bg-white py-2 pl-9 pr-3 text-sm text-foreground-900 placeholder:text-foreground-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={disabled || state === "loading"}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary-500 px-3.5 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "loading" ? (
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
            ) : (
              <i className="ri-search-line w-4 h-4 flex items-center justify-center"></i>
            )}
            検索
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-2 text-sm font-medium text-foreground-600 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              閉じる
            </button>
          )}
        </div>
      </div>

      {state === "loading" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground-500">
          <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
          検索中...
        </p>
      )}

      {state === "error" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
          商品を検索できませんでした。時間をおいて再度お試しください。
        </p>
      )}

      {state === "empty" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground-500">
          <i className="ri-inbox-line w-4 h-4 flex items-center justify-center"></i>
          該当する商品が見つかりませんでした。
        </p>
      )}

      {state === "success" && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-background-200 bg-white">
          {results.map((product) => (
            <li key={product.product_id} className="border-b border-background-100 last:border-b-0">
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    product_id: product.product_id,
                    product_name: product.product_name ?? "",
                  })
                }
                disabled={disabled}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background-100">
                  <i className="ri-shopping-bag-3-line w-4 h-4 flex items-center justify-center text-foreground-500"></i>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground-950">
                    {product.product_name || "（商品名なし）"}
                  </span>
                  <span className="block truncate font-mono text-xs text-foreground-500">
                    {product.product_id}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-foreground-500">
                  {formatYen(product.planned_sale_price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
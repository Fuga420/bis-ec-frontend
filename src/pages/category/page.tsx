import { useState } from "react";
import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import ProductListSkeleton from "@/pages/products/components/ProductListSkeleton";
import ProductLoadErrorState from "@/pages/products/components/ProductLoadErrorState";
import ProductPagination from "@/pages/products/components/ProductPagination";
import ProductSearchField from "@/pages/products/components/ProductSearchField";
import CategoryProductRow from "./components/CategoryProductRow";
import { useCategoryProductList } from "./hooks/useCategoryProductList";

interface CategoryListingPageProps {
  // ヘッダーに出すページ名（サイドナビのラベルと同じ表記）。
  pageTitle: string;
  // カテゴリ値（未指定＝カテゴリで絞らない）。
  category?: string;
  // 固定の絞り込み語（ブランド名など）。カテゴリを持たない区分で使う。
  brandKeyword?: string;
}

/**
 * カテゴリ別の商品一覧（スニーカー・クロムハーツ・アパレル）。
 *
 * 商品マスターは共通のまま、カテゴリごとの入口だけを分ける。
 * 取得は既存の商品一覧APIをそのまま使い、検索とページ送りだけを提供する。
 */
export default function CategoryListingPage({
  pageTitle,
  category,
  brandKeyword,
}: CategoryListingPageProps) {
  const { isTestMode } = useOperatingMode();
  const [reloadKey, setReloadKey] = useState(0);

  const {
    loadState,
    products,
    count,
    totalPages,
    page,
    setPage,
    keyword,
    setKeyword,
  } = useCategoryProductList({ category, brandKeyword, isTestMode, reloadKey });

  const showSkeleton = loadState === "loading" && products.length === 0;

  return (
    <AdminShell
      pageTitle={pageTitle}
      mainClassName="page-fade w-full max-w-5xl px-4 py-4 md:px-6 md:py-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 sm:w-[320px]">
          <ProductSearchField
            value={keyword}
            onChange={setKeyword}
            placeholder="商品名・商品IDで検索"
            ariaLabel="商品を検索"
            clearLabel="検索語をクリア"
          />
        </div>
        {isTestMode && (
          <span className="whitespace-nowrap text-[11px] leading-none text-foreground-400">
            テスト商品を表示中
          </span>
        )}
      </div>

      {loadState === "error" ? (
        <ProductLoadErrorState onRetry={() => setReloadKey((key) => key + 1)} />
      ) : showSkeleton ? (
        <ProductListSkeleton />
      ) : (
        <>
          <p className="admin-meta mb-2 text-foreground-500">
            該当{" "}
            <span className="font-semibold tabular-nums text-foreground-950">
              {count}
            </span>{" "}
            件
            {totalPages > 1 && (
              <span className="ml-1 text-foreground-400">
                （{page} / {totalPages} ページ）
              </span>
            )}
          </p>

          {products.length === 0 ? (
            <div className="ui-card flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground-700">
                該当する商品がありません
              </p>
              {keyword !== "" && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="bis-btn bis-btn-secondary mt-3"
                >
                  検索をクリア
                </button>
              )}
            </div>
          ) : (
            <div className="ui-card overflow-hidden rounded-lg">
              {products.map((product) => (
                <CategoryProductRow
                  key={product.product_id}
                  product={product}
                />
              ))}
            </div>
          )}

          <ProductPagination
            page={page}
            totalPages={totalPages}
            count={count}
            onPageChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      )}
    </AdminShell>
  );
}
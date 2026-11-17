import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import ProductListSkeleton from "@/pages/products/components/ProductListSkeleton";
import ProductLoadErrorState from "@/pages/products/components/ProductLoadErrorState";
import ProductPagination from "@/pages/products/components/ProductPagination";
import {
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "@/pages/products/lib/sort";
import {
  buildProductDetailLinkState,
  buildSneakersOrigin,
  buildSneakersQueryString,
  readSneakersQuery,
} from "@/lib/productOrigin";
import SneakersFilterBar from "@/pages/sneakers/components/SneakersFilterBar";
import SneakersProductRow from "@/pages/sneakers/components/SneakersProductRow";
import { SNEAKER_COL } from "@/pages/sneakers/components/sneakerTableColumns";
import { useSneakerProductList } from "@/pages/sneakers/hooks/useSneakerProductList";
import { hasSneakerSize } from "@/pages/sneakers/lib/size";

// 連続入力による通信を防ぐ検索のデバウンス時間（商品一覧・カテゴリ別一覧と同じ）。
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Sneakers専用ページ。
 *
 * 商品マスターは共通のまま、既存一覧APIにカテゴリ `sneaker` を固定で渡して
 * スニーカーだけを表示する専用ビュー。新しい商品マスターやAPIは作らない。
 * 検索・絞り込み・並び替え・ページ番号は既存APIのパラメータだけで行い、
 * 商品行からは既存の商品詳細（/products/:id）へ遷移する。
 */
export default function SneakersPage() {
  const { isTestMode } = useOperatingMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);

  // 商品詳細から戻ってきたときなど、URLに一覧の状態が入っている場合はその条件で開く。
  const [initialQuery] = useState(() => readSneakersQuery(searchParams));

  const [search, setSearch] = useState(initialQuery.search);
  const [debouncedSearch, setDebouncedSearch] = useState(
    initialQuery.search.trim()
  );
  const [publishStatus, setPublishStatus] = useState(
    initialQuery.publishStatus
  );
  const [inventoryStatus, setInventoryStatus] = useState(
    initialQuery.inventoryStatus
  );
  const [sortKey, setSortKey] = useState<ProductSortKey>(initialQuery.sort);
  const [page, setPage] = useState(initialQuery.page);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  // 条件が変わったら先頭ページに戻す。
  // 初回表示（URLから復元したページ番号）はそのまま使うため、初回だけは何もしない。
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, publishStatus, inventoryStatus, sortKey, isTestMode]);

  const { loadState, products, count, totalPages } = useSneakerProductList({
    search: debouncedSearch,
    publishStatus,
    inventoryStatus,
    sortKey,
    page,
    isTestMode,
    reloadKey,
  });

  // 件数が減った等で表示中のページが存在しない場合は最終ページに収める。
  useEffect(() => {
    if (loadState !== "success") return;
    const maxPage = Math.max(1, totalPages);
    if (page > maxPage) setPage(maxPage);
  }, [loadState, totalPages, page]);

  // 表示中の条件をURLに反映する（戻る操作・再読み込みでも同じ一覧に戻れるようにする）。
  // 商品の取得・絞り込みの処理自体は変えないため、履歴は増やさず replace で置き換える。
  useEffect(() => {
    const next = buildSneakersQueryString({
      search: debouncedSearch,
      publishStatus,
      inventoryStatus,
      sort: sortKey,
      page,
    });
    if (next === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [
    debouncedSearch,
    publishStatus,
    inventoryStatus,
    sortKey,
    page,
    searchParams,
    setSearchParams,
  ]);

  // 商品詳細へ渡す遷移元（パンくず・戻り先の復元に使う）。
  const detailLinkState = useMemo(
    () =>
      buildProductDetailLinkState(
        buildSneakersOrigin({
          search: debouncedSearch,
          publishStatus,
          inventoryStatus,
          sort: sortKey,
          page,
        })
      ),
    [debouncedSearch, publishStatus, inventoryStatus, sortKey, page]
  );

  const hasFilter =
    debouncedSearch !== "" || publishStatus !== "" || inventoryStatus !== "";
  const showSkeleton = loadState === "loading" && products.length === 0;

  // サイズは実データがあるページだけ列として出す（全行空欄の列を作らない）。
  const showSizeColumn = products.some((product) =>
    hasSneakerSize(product.sneaker_size)
  );

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setPublishStatus("");
    setInventoryStatus("");
    setPage(1);
  };

  return (
    <AdminShell
      pageTitle="Sneakers"
      mainClassName="page-fade w-full px-4 py-4 md:px-6 md:py-5 lg:px-8"
    >
      {isTestMode && (
        <p className="mb-2 text-[11px] leading-none text-foreground-400">
          テスト商品を表示中
        </p>
      )}

      <SneakersFilterBar
        search={search}
        onSearchChange={setSearch}
        publishStatus={publishStatus}
        onPublishStatusChange={setPublishStatus}
        inventoryStatus={inventoryStatus}
        onInventoryStatusChange={setInventoryStatus}
        onClear={clearFilters}
        disabled={showSkeleton}
      />

      {loadState === "error" ? (
        <ProductLoadErrorState
          title="商品を取得できませんでした"
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : showSkeleton ? (
        <ProductListSkeleton />
      ) : (
        <>
          {/* 件数と並び替えを同じ操作行にまとめる（左：件数・ページ / 右：並び替え） */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="admin-meta text-foreground-500">
              該当{" "}
              <span className="admin-numeric font-semibold text-foreground-950">
                {count}
              </span>{" "}
              件
              {totalPages > 1 && (
                <span className="ml-1 text-foreground-400">
                  （{page} / {totalPages} ページ）
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <label
                htmlFor="sneaker-sort"
                className="whitespace-nowrap text-xs text-foreground-500"
              >
                並び替え
              </label>
              <select
                id="sneaker-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as ProductSortKey)}
                aria-label="商品の並び替え"
                className="bis-field min-w-0 flex-1 sm:flex-none sm:w-[176px]"
              >
                {PRODUCT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="ui-card flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground-700">
                {hasFilter
                  ? "条件に一致する商品がありません"
                  : "商品がありません"}
              </p>
              {hasFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="bis-btn bis-btn-sm bis-btn-secondary mt-3 whitespace-nowrap"
                >
                  条件をクリア
                </button>
              )}
            </div>
          ) : (
            <div className="ui-card overflow-hidden rounded-lg">
              {/* 列見出し（行と同じ列幅を使い、文字の開始位置を揃える）。
                  狭い画面では公開状態 → サイズの順に列を落とし、横スクロールを出さない。 */}
              <div className="hidden items-center gap-3 border-b border-background-200 px-3 py-1.5 md:flex">
                <span
                  className={`text-[11px] font-medium text-foreground-500 ${SNEAKER_COL.image}`}
                >
                  画像
                </span>
                <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground-500">
                  商品
                </span>
                {showSizeColumn && (
                  <span
                    className={`text-right text-[11px] font-medium text-foreground-500 ${SNEAKER_COL.size}`}
                  >
                    サイズ
                  </span>
                )}
                <span
                  className={`hidden text-right text-[11px] font-medium text-foreground-500 lg:block ${SNEAKER_COL.publish}`}
                >
                  公開状態
                </span>
                <span
                  className={`text-right text-[11px] font-medium text-foreground-500 ${SNEAKER_COL.inventory}`}
                >
                  在庫状態
                </span>
                <span
                  className={`text-right text-[11px] font-medium text-foreground-500 ${SNEAKER_COL.price}`}
                >
                  販売価格
                </span>
              </div>

              {products.map((product) => (
                <SneakersProductRow
                  key={product.product_id}
                  product={product}
                  detailLinkState={detailLinkState}
                  showSize={showSizeColumn}
                />
              ))}
            </div>
          )}

          <ProductPagination
            page={page}
            totalPages={totalPages}
            count={count}
            showSummary={false}
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
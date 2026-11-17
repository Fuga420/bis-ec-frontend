import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import ProductListSkeleton from "@/pages/products/components/ProductListSkeleton";
import ProductLoadErrorState from "@/pages/products/components/ProductLoadErrorState";
import ProductPagination from "@/pages/products/components/ProductPagination";
import { type ProductSortKey } from "@/pages/products/lib/sort";
import { PURCHASE_PRICE_SORT_OPTIONS } from "@/pages/products/lib/purchasePriceSort";
import {
  buildApparelOrigin,
  buildApparelQueryString,
  buildProductDetailLinkState,
  readApparelQuery,
} from "@/lib/productOrigin";
import {
  APPAREL_SEARCH_DEBOUNCE_MS,
} from "@/pages/apparel/lib/apparel";
import ApparelFilterBar from "@/pages/apparel/components/ApparelFilterBar";
import ApparelProductRow from "@/pages/apparel/components/ApparelProductRow";
import { APPAREL_COL } from "@/pages/apparel/components/apparelTableColumns";
import { useApparelProductList } from "@/pages/apparel/hooks/useApparelProductList";
import { buildRegisterPath } from "@/pages/register/lib/registerOrigin";

/**
 * Apparel専用ページ（/apparel）。
 *
 * 商品マスターは共通のまま、既存の一覧APIにカテゴリ（商品種別）`apparel` を
 * 固定で渡してアパレル商品だけを表示する専用ビュー。
 * 新しい商品マスター・カテゴリ・API は作らない。
 * 検索・公開状態・在庫状態・並び順・ページ番号は既存APIのパラメータだけで行い、
 * 商品行からは既存の商品詳細（/products/:id）へ遷移する。
 */
export default function ApparelPage() {
  const { isTestMode } = useOperatingMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);

  // 商品詳細から戻ってきたときなど、URLに一覧の状態が入っている場合はその条件で開く。
  const [initialQuery] = useState(() => readApparelQuery(searchParams));

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
      APPAREL_SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  // 条件が変わったら1ページ目に戻す。
  // 初回表示（URLから復元したページ番号）はそのまま使うため、初回だけは何もしない。
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, publishStatus, inventoryStatus, sortKey, isTestMode]);

  const { loadState, products, count, totalPages } = useApparelProductList({
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
  // 取得処理自体は変えないため、履歴は増やさず replace で置き換える。
  useEffect(() => {
    const next = buildApparelQueryString({
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
        buildApparelOrigin({
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

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setPublishStatus("");
    setInventoryStatus("");
    setPage(1);
  };

  return (
    <AdminShell
      pageTitle="Apparel"
      mainClassName="page-fade w-full px-4 py-4 md:px-6 md:py-5 lg:px-8"
    >
      {isTestMode && (
        <p className="mb-2 text-[11px] leading-none text-foreground-400">
          テスト商品を表示中
        </p>
      )}

      <ApparelFilterBar
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
                htmlFor="apparel-sort"
                className="whitespace-nowrap text-xs text-foreground-500"
              >
                並び替え
              </label>
              <select
                id="apparel-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as ProductSortKey)}
                aria-label="商品の並び替え"
                className="bis-field min-w-0 flex-1 sm:flex-none sm:w-[176px]"
              >
                {PURCHASE_PRICE_SORT_OPTIONS.map((option) => (
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
              {hasFilter ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="bis-btn bis-btn-sm bis-btn-secondary mt-3 whitespace-nowrap"
                >
                  条件をクリア
                </button>
              ) : (
                // 0件の理由を取り違えないよう、対象判定の条件だけを短く添える。
                <>
                  <p className="mt-2 max-w-[420px] text-[12px] leading-[1.6] text-foreground-400">
                    対象は商品種別が「アパレル」の商品です。別の種別で登録された商品は表示されません。
                  </p>
                  <Link
                    to={buildRegisterPath("apparel")}
                    className="bis-btn bis-btn-sm bis-btn-secondary mt-3 whitespace-nowrap"
                  >
                    商品を登録
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="ui-card overflow-hidden rounded-lg">
              {/* 列見出し（行と同じ列幅を使い、文字の開始位置を揃える）。
                  狭い画面では公開状態 → 在庫状態の順に列を落とし、横スクロールを出さない。 */}
              <div className="hidden items-center gap-3 border-b border-background-200 px-3 py-1.5 md:flex">
                <span
                  className={`text-[11px] font-medium text-foreground-500 ${APPAREL_COL.image}`}
                >
                  画像
                </span>
                <span className="min-w-0 flex-1 text-[11px] font-medium text-foreground-500">
                  商品
                </span>
                <span
                  className={`text-right text-[11px] font-medium text-foreground-500 ${APPAREL_COL.purchase}`}
                >
                  仕入価格
                </span>
                <span
                  className={`text-right text-[11px] font-medium text-foreground-500 ${APPAREL_COL.price}`}
                >
                  販売価格
                </span>
                <span
                  className={`hidden text-right text-[11px] font-medium text-foreground-500 lg:block ${APPAREL_COL.publish}`}
                >
                  公開状態
                </span>
                <span
                  className={`text-right text-[11px] font-medium text-foreground-500 ${APPAREL_COL.inventory}`}
                >
                  在庫状態
                </span>
              </div>

              {products.map((product) => (
                <ApparelProductRow
                  key={product.product_id}
                  product={product}
                  detailLinkState={detailLinkState}
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import ProductPagination from "@/pages/products/components/ProductPagination";
import ProductLoadErrorState from "@/pages/products/components/ProductLoadErrorState";
import PokecaLightResultModal from "@/pages/products/components/PokecaLightResultModal";
import { usePokecaRawStorageAi } from "@/pages/products/hooks/usePokecaRawStorageAi";
import type { PokecaLightWorkerState } from "@/pages/products/lib/pokecaRawStorageAi";
import type { AdminProduct } from "@/pages/products/types";
import PokekaTabs, { type PokekaTabKey } from "./components/PokekaTabs";
import PokecaLightAiPanel, {
  type PokecaLightStatusView,
} from "./components/PokecaLightAiPanel";
import PokecaLightProgressBar from "./components/PokecaLightProgressBar";
import StorageFilterBar, {
  type PriceFilterValue,
  type StorageSortValue,
} from "./components/StorageFilterBar";
import StorageProductTable from "./components/StorageProductTable";
import PokecaComingSoon from "./components/PokecaComingSoon";
import PokecaLightRunDialog from "./components/PokecaLightRunDialog";
import StorageSubTabs from "./components/StorageSubTabs";
import StorageScopePending from "./components/StorageScopePending";
import { usePokekaRawStorageList } from "./hooks/usePokekaRawStorageList";
import {
  buildPokekaOrigin,
  buildPokekaQueryString,
  buildProductDetailLinkState,
  readPokekaQuery,
} from "@/lib/productOrigin";
import {
  buildLightCoverage,
  buildLightInfoMap,
  collectBoxOptions,
  countByIllustrator,
  parseStoragePosition,
  resolveReferencePrice,
  sortStorageProducts,
} from "./lib/rawStorage";
import {
  filterProductsByScope,
  type StorageScopeKey,
} from "./lib/storageScopes";

// 一覧の1ページあたり件数（商品一覧と同じ密度に揃える）。
const PAGE_SIZE = 50;

const COMING_SOON: Record<
  Exclude<PokekaTabKey, "storage">,
  { label: string }
> = {
  vss: { label: "VSS" },
  psa: { label: "PSA" },
  other: { label: "その他鑑定" },
};

// ライト版AIパネルに出す「現在の処理状態」。
// 表示は既存のジョブ状態（idle / running / completed / failed）だけに対応させ、
// 進捗件数は実行中のみ実データから渡す。
function describeLightStatus(
  worker: PokecaLightWorkerState | null | undefined
): PokecaLightStatusView {
  if (!worker) return { label: "待機中", tone: "idle" };
  if (worker.status === "running") {
    return {
      label: "処理中",
      tone: "running",
      processed: worker.processedCount,
      total: worker.totalCount,
    };
  }
  if (worker.status === "failed") {
    return {
      label: worker.successCount > 0 ? "一部失敗" : "失敗",
      tone: "failed",
    };
  }
  if (worker.status === "completed") return { label: "完了", tone: "done" };
  return { label: "待機中", tone: "idle" };
}

export default function PokekaPage() {
  const { isTestMode } = useOperatingMode();
  const [searchParams, setSearchParams] = useSearchParams();

  // 商品詳細のパンくずから戻ってきたときなど、URLに一覧の状態が入っている場合は
  // その条件（タブ・区分・絞り込み・ページ番号）で開く。
  // 直接アクセス（パラメータなし）は従来どおりの初期表示になる。
  const [initialQuery] = useState(() => readPokekaQuery(searchParams));

  const [tab, setTab] = useState<PokekaTabKey>(initialQuery.tab);
  // ストレージ内の区分。初期表示は既存の旧裏ストレージ一覧（「旧裏」）。
  const [storageScope, setStorageScope] =
    useState<StorageScopeKey>(initialQuery.scope);
  const [reloadKey, setReloadKey] = useState(0);

  // 旧裏ストレージ商品（storage_location が「旧裏ストレージ/」で始まる商品）を全件取得し、
  // 画面側で50件ずつページ表示する（「旧裏ストレージを隠す」トグルと同じ方式）。
  const { loadState, items, errorMessage } = usePokekaRawStorageList({
    isTestMode,
    reloadKey,
  });

  // ライト版AIの開始・進捗（画面を開き直しても、別デバイスで開いても進行中ジョブを表示する）
  const pokecaLight = usePokecaRawStorageAi({
    isTestMode,
    onFinished: () => setReloadKey((k) => k + 1),
    // 実行中ジョブが無いときも GET status を追従し、/products 等で開始された実行も
    // このパネルの状態表示・結果確認に反映する（20秒間隔・表示中のみ）。
    idleFollowMs: 20000,
  });

  // 区分ごとの表示対象。判定は storageScopes.ts に集約している。
  // 「すべて」は現時点で判定できる旧裏ストレージ商品のみ（現行は未分類のため空）。
  const scopeItems = useMemo(
    () => filterProductsByScope(items, storageScope),
    [items, storageScope]
  );

  const lightItems = pokecaLight.worker?.items;
  const infoMap = useMemo(() => buildLightInfoMap(lightItems), [lightItems]);
  const lightStatus = describeLightStatus(pokecaLight.worker);

  // 表示できる実行結果が本当にあるか（実行中・完了・失敗のいずれかのジョブ）。
  // 商品別の明細がまだ返っていない実行中ジョブでも「結果を見る」を開けるようにする。
  const rawLightWorker = pokecaLight.worker;
  const hasLightResult = Boolean(
    rawLightWorker &&
      (rawLightWorker.status !== "idle" ||
        rawLightWorker.isActive ||
        rawLightWorker.items.length > 0 ||
        rawLightWorker.failures.length > 0 ||
        rawLightWorker.totalCount > 0)
  );

  // 検索は取得済みの商品（この区分の全件）に対する画面側の絞り込み。
  // 新しい検索APIは呼ばず、商品名と商品IDの部分一致で判定する。
  const [searchQuery, setSearchQuery] = useState(initialQuery.search);
  const [boxFilter, setBoxFilter] = useState(initialQuery.box);
  const [illustratorFilter, setIllustratorFilter] = useState(
    initialQuery.author
  );
  const [priceFilter, setPriceFilter] = useState<PriceFilterValue>(
    initialQuery.price
  );
  // 並び順。既定は箱番・枝番の順（従来の一覧順）。
  const [sortValue, setSortValue] = useState<StorageSortValue>("position");
  const [page, setPage] = useState(initialQuery.page);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  // ライト版AIの操作パネル（通常画面には常設せず「AI生成」から開く）
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const boxOptions = useMemo(() => collectBoxOptions(scopeItems), [scopeItems]);
  // 作家の選択肢は、商品別情報とAPIの集計値（illustrator_counts）の両方から作る。
  // 商品別情報が返らない応答でも、集計に含まれる作家を選べるようにする。
  const illustratorOptions = useMemo(() => {
    const merged = new Map<string, number>();
    countByIllustrator(infoMap).forEach(({ illustrator, count }) => {
      merged.set(illustrator, count);
    });
    (pokecaLight.worker?.illustratorCounts ?? []).forEach(
      ({ illustrator, count }) => {
        if (!merged.has(illustrator)) merged.set(illustrator, count);
      }
    );
    return Array.from(merged.entries())
      .sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")
      )
      .map(([illustrator]) => illustrator);
  }, [infoMap, pokecaLight.worker]);

  // 参考価格の判定に使える商品があるか（候補価格または販売価格）
  const priceFilterAvailable = useMemo(
    () =>
      scopeItems.some(
        (product) =>
          resolveReferencePrice(product, infoMap.get(product.product_id)) !== null
      ),
    [scopeItems, infoMap]
  );

  // パネルの整備状況。商品別情報が無いときはAPIの集計値で表示する。
  const lightCoverage = useMemo(
    () => buildLightCoverage(pokecaLight.worker, scopeItems, infoMap),
    [pokecaLight.worker, scopeItems, infoMap]
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const box = boxFilter.trim();
    const illustrator = illustratorFilter.trim();
    return scopeItems.filter((product) => {
      if (query) {
        const name = (product.product_name || "").toLowerCase();
        const id = (product.product_id || "").toLowerCase();
        if (!name.includes(query) && !id.includes(query)) return false;
      }
      if (box && parseStoragePosition(product.storage_location).box !== box) {
        return false;
      }
      if (illustrator) {
        const info = infoMap.get(product.product_id);
        if (!info || info.illustrator !== illustrator) return false;
      }
      if (priceFilter !== "all") {
        const price = resolveReferencePrice(
          product,
          infoMap.get(product.product_id)
        );
        if (priceFilter === "priced" && price === null) return false;
        if (priceFilter === "unpriced" && price !== null) return false;
      }
      return true;
    });
  }, [
    scopeItems,
    searchQuery,
    boxFilter,
    illustratorFilter,
    priceFilter,
    infoMap,
  ]);

  const hasFilter =
    searchQuery !== "" ||
    boxFilter !== "" ||
    illustratorFilter !== "" ||
    priceFilter !== "all";

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 絞り込んだ結果を並べ替えてからページ分割する（取得済みデータの並べ替えのみ）。
  const sorted = useMemo(
    () => sortStorageProducts(filtered, sortValue, infoMap),
    [filtered, sortValue, infoMap]
  );
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  // 表示中のページが範囲外になったら最終ページへ収める。
  // 読み込み中は件数がまだ0件（totalPages=1）なので、URLから復元したページ番号を
  // 消してしまわないよう、取得完了後にだけ補正する。
  useEffect(() => {
    if (loadState !== "success") return;
    if (page > totalPages) setPage(totalPages);
  }, [loadState, page, totalPages]);

  // モード切替などで表示できる結果が無くなったら、結果ビューは閉じる。
  useEffect(() => {
    if (isResultOpen && !hasLightResult) setIsResultOpen(false);
  }, [isResultOpen, hasLightResult]);

  // タブ・モード・絞り込みを変えたら1ページ目に戻し、選択を解除する。
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setBoxFilter("");
    setIllustratorFilter("");
    setPriceFilter("all");
    setPage(1);
  }, []);

  // タブを切り替えたら1ページ目に戻し、絞り込みと選択を解除する。
  // 初回表示（商品詳細のパンくずからURLの条件で戻ってきた直後）は、
  // その条件をそのまま使う。
  const handleTabChange = (next: PokekaTabKey) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setSelectedIds(new Set());
    setSearchQuery("");
    setBoxFilter("");
    setIllustratorFilter("");
    setPriceFilter("all");
  };

  // 通常モード／テストモードが切り替わったときだけ同じリセットを行う。
  // 直前のモードを覚えて比べることで、初回表示ではリセットしない。
  const prevTestModeRef = useRef(isTestMode);
  useEffect(() => {
    if (prevTestModeRef.current === isTestMode) return;
    prevTestModeRef.current = isTestMode;
    setPage(1);
    setSelectedIds(new Set());
    setSearchQuery("");
    setBoxFilter("");
    setIllustratorFilter("");
    setPriceFilter("all");
  }, [isTestMode]);

  // 区分を切り替えたら先頭ページに戻し、選択（＝ライト版AIの実行対象）を解除する。
  // 検索・絞り込み条件は同一の商品集合に対する条件のため、そのまま維持する。
  const handleScopeChange = (next: StorageScopeKey) => {
    if (next === storageScope) return;
    setStorageScope(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSearchChange = (next: string) => {
    setSearchQuery(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleBoxChange = (next: string) => {
    setBoxFilter(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleIllustratorChange = (next: string) => {
    setIllustratorFilter(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handlePriceChange = (next: PriceFilterValue) => {
    setPriceFilter(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  // 並び順は表示の見方だけの切り替えなので、選択（実行対象）は解除しない。
  const handleSortChange = (next: StorageSortValue) => {
    setSortValue(next);
    setPage(1);
  };

  // 表示中の条件（タブ・区分・絞り込み・ページ）をURLに反映する。
  // ブラウザの戻る操作や再読み込みでも同じ一覧に戻れるようにするための表示状態の保存で、
  // 商品の取得・検索・絞り込みの処理自体は変更しない（履歴を増やさないよう replace を使う）。
  useEffect(() => {
    const next = buildPokekaQueryString({
      tab,
      scope: storageScope,
      search: searchQuery,
      box: boxFilter,
      author: illustratorFilter,
      price: priceFilter,
      page,
    });
    if (next === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [
    tab,
    storageScope,
    searchQuery,
    boxFilter,
    illustratorFilter,
    priceFilter,
    page,
    searchParams,
    setSearchParams,
  ]);

  // 商品詳細へ渡す遷移元（パンくずと戻り先の復元に使う）。
  // 一覧の条件が変わったときだけ作り直す。
  const detailLinkState = useMemo(
    () =>
      buildProductDetailLinkState(
        buildPokekaOrigin({
          tab,
          scope: storageScope,
          search: searchQuery,
          box: boxFilter,
          author: illustratorFilter,
          price: priceFilter,
          page,
        })
      ),
    [
      tab,
      storageScope,
      searchQuery,
      boxFilter,
      illustratorFilter,
      priceFilter,
      page,
    ]
  );

  const pageSelectedCount = useMemo(
    () => pageItems.filter((product) => selectedIds.has(product.product_id)).length,
    [pageItems, selectedIds]
  );
  const isAllPageSelected =
    pageItems.length > 0 && pageSelectedCount === pageItems.length;
  const isPagePartlySelected =
    pageSelectedCount > 0 && pageSelectedCount < pageItems.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = isPagePartlySelected;
  }, [isPagePartlySelected]);

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected =
      pageItems.length > 0 &&
      pageItems.every((product) => selectedIds.has(product.product_id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach((product) => next.delete(product.product_id));
      } else {
        pageItems.forEach((product) => next.add(product.product_id));
      }
      return next;
    });
  };

  // 選択済み商品（ページを跨いだ全件）。表示対象は旧裏ストレージ商品のみ。
  const selectedProducts = useMemo<AdminProduct[]>(
    () => scopeItems.filter((product) => selectedIds.has(product.product_id)),
    [scopeItems, selectedIds]
  );

  // 結果モーダルのサムネイル用。取得済みの一覧から商品ID→画像URLのマップを作る。
  const imageMap = useMemo(() => {
    const map = new Map<string, string>();
    scopeItems.forEach((product) => {
      if (product.main_image_display_url) {
        map.set(product.product_id, product.main_image_display_url);
      }
    });
    return map;
  }, [scopeItems]);

  // 失敗した商品だけをライト版で再実行する（既存の開始処理を product_ids 指定で呼ぶ）。
  const handleRetryFailedLight = async (productIds: string[]) => {
    if (productIds.length === 0) return;
    await pokecaLight.start(productIds);
  };

  const handleRun = async () => {
    if (selectedProducts.length === 0) return;
    const result = await pokecaLight.start(
      selectedProducts.map((product) => product.product_id)
    );
    if (result === "failed") return;
    setIsRunDialogOpen(false);
    if (result === "started") setSelectedIds(new Set());
  };

  const retry = () => setReloadKey((k) => k + 1);

  const isStorage = tab === "storage";
  const comingSoon = isStorage ? null : COMING_SOON[tab];

  // 実行中だけ表示する進捗と、直近の実行に失敗が残っているときだけ出す控えめな導線。
  // いずれも既存のジョブ状態（worker_state）の値だけを使う。
  const lightProcessed = pokecaLight.worker?.processedCount ?? 0;
  const lightTotal = pokecaLight.worker?.totalCount ?? 0;
  const lightFailedCount = pokecaLight.worker?.failedCount ?? 0;
  const showLightFailureNotice =
    !pokecaLight.isRunning && hasLightResult && lightFailedCount > 0;

  // 「すべて」は現時点で分類できる商品だけを対象にしていることを明示する。
  const isAllScope = storageScope === "all";
  const isOldScope = storageScope === "old";
  const isCurrentScope = storageScope === "current";
  const showsStorageList = isStorage && !isCurrentScope;

  const emptyTitle = hasFilter
    ? "条件に一致する商品がありません"
    : isTestMode
      ? "テスト商品がありません"
      : "商品が見つかりません";

  return (
    <AdminShell
      pageTitle="Pokémon Card"
      mainClassName="page-fade px-4 py-4 md:px-6 md:py-5 lg:px-8"
    >
      <div className="mb-2.5 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <PokekaTabs value={tab} onChange={handleTabChange} />
        </div>
        {isTestMode && (
          <p className="shrink-0 pb-2 text-[11px] leading-none text-foreground-400">
            テスト商品を表示中
          </p>
        )}
      </div>

      {isStorage && (
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StorageSubTabs value={storageScope} onChange={handleScopeChange} />
          {isOldScope && (
            <button
              type="button"
              onClick={() => setIsAiPanelOpen(true)}
              className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              AI生成
            </button>
          )}
        </div>
      )}

      {!isStorage && comingSoon && (
        <div className="tab-fade">
          <PokecaComingSoon label={comingSoon.label} />
        </div>
      )}

      {isStorage && isCurrentScope && (
        <div className="tab-fade">
          <StorageScopePending />
        </div>
      )}

      {showsStorageList && (
        <div className="tab-fade space-y-3">
          {isOldScope && pokecaLight.isRunning && (
            <PokecaLightProgressBar
              processed={lightProcessed}
              total={lightTotal}
              onOpen={() => setIsAiPanelOpen(true)}
            />
          )}

          {isOldScope && showLightFailureNotice && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] leading-none">
              <span className="whitespace-nowrap text-amber-700">
                失敗 {lightFailedCount.toLocaleString("ja-JP")}件
              </span>
              <button
                type="button"
                onClick={() => setIsResultOpen(true)}
                className="cursor-pointer whitespace-nowrap text-foreground-500 underline-offset-2 transition-colors hover:text-foreground-900 hover:underline"
              >
                結果を見る
              </button>
            </div>
          )}

          <StorageFilterBar
            searchValue={searchQuery}
            onSearchChange={handleSearchChange}
            boxValue={boxFilter}
            boxOptions={boxOptions}
            onBoxChange={handleBoxChange}
            authorValue={illustratorFilter}
            authorOptions={illustratorOptions}
            onAuthorChange={handleIllustratorChange}
            priceValue={priceFilter}
            onPriceChange={handlePriceChange}
            priceFilterAvailable={priceFilterAvailable}
            sortValue={sortValue}
            onSortChange={handleSortChange}
            disabled={loadState === "loading"}
            onClear={clearFilters}
          />

          <div className="flex flex-wrap items-center gap-2">
            <p className="admin-meta text-foreground-500">
              {isAllScope ? "表示対象 " : "該当 "}
              <span className="admin-numeric font-semibold text-foreground-950">
                {filtered.length.toLocaleString("ja-JP")}
              </span>{" "}
              件
              {totalPages > 1 && (
                <span className="ml-1 text-foreground-400">
                  （{page} / {totalPages} ページ）
                </span>
              )}
            </p>
            {selectedProducts.length > 0 && (
              <p className="admin-meta text-foreground-500">
                ／ 選択中{" "}
                <span className="admin-numeric font-semibold text-foreground-950">
                  {selectedProducts.length}
                </span>{" "}
                件
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-2 cursor-pointer whitespace-nowrap text-[12px] text-foreground-500 underline-offset-2 transition-colors hover:text-foreground-800 hover:underline"
                >
                  選択を解除
                </button>
              </p>
            )}
            {loadState === "loading" && (
              <span className="whitespace-nowrap text-xs text-foreground-400">
                読み込み中
              </span>
            )}
          </div>

          {loadState === "error" && <ProductLoadErrorState onRetry={retry} />}

          {loadState === "loading" && scopeItems.length === 0 && (
            <div className="ui-card space-y-2 rounded-lg p-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className="product-skeleton-block h-16 w-full rounded-md"
                ></div>
              ))}
            </div>
          )}

          {loadState === "success" && filtered.length === 0 && (
            <div className="ui-card flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground-700">
                {emptyTitle}
              </p>
              {hasFilter && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-md border border-background-300 bg-white px-3 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100"
                >
                  条件をクリア
                </button>
              )}
            </div>
          )}

          {filtered.length > 0 && (
            <StorageProductTable
              products={pageItems}
              infoMap={infoMap}
              selectedIds={selectedIds}
              allSelected={isAllPageSelected}
              partlySelected={isPagePartlySelected}
              disabled={pokecaLight.isStarting}
              detailLinkState={detailLinkState}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              selectAllRef={selectAllRef}
            />
          )}

          {filtered.length > 0 && (
            <ProductPagination
              page={page}
              totalPages={totalPages}
              count={filtered.length}
              disabled={pokecaLight.isStarting}
              onPageChange={(next) => {
                setPage(next);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}

          {errorMessage && loadState === "error" && (
            <p className="text-[11px] leading-relaxed text-foreground-500">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      <PokecaLightAiPanel
        open={isStorage && isOldScope && isAiPanelOpen}
        onClose={() => setIsAiPanelOpen(false)}
        products={scopeItems}
        coverage={lightCoverage}
        selectedCount={selectedProducts.length}
        isStarting={pokecaLight.isStarting}
        status={lightStatus}
        worker={pokecaLight.worker}
        noticeMessage={pokecaLight.noticeMessage}
        errorMessage={pokecaLight.errorMessage}
        onRun={() => setIsRunDialogOpen(true)}
        onOpenResult={() => setIsResultOpen(true)}
        canOpenResult={hasLightResult}
      />

      <PokecaLightRunDialog
        open={isRunDialogOpen}
        count={selectedProducts.length}
        isTestMode={isTestMode}
        isStarting={pokecaLight.isStarting}
        errorMessage={pokecaLight.errorMessage}
        onCancel={() => setIsRunDialogOpen(false)}
        onConfirm={() => void handleRun()}
      />

      <PokecaLightResultModal
        open={isResultOpen && hasLightResult}
        worker={pokecaLight.worker}
        products={scopeItems}
        imageMap={imageMap}
        isRefreshing={pokecaLight.isRefreshing}
        isStarting={pokecaLight.isStarting}
        isAutoRefreshing={pokecaLight.isRunning}
        errorMessage={pokecaLight.errorMessage}
        noticeMessage={pokecaLight.noticeMessage}
        onRefresh={() => void pokecaLight.refresh()}
        onRetryFailed={(productIds) => void handleRetryFailedLight(productIds)}
        onClose={() => setIsResultOpen(false)}
      />
    </AdminShell>
  );
}
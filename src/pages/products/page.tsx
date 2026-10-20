import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import ProductRow, {
  ACTION_COLUMN_WIDTH,
} from "./components/ProductRow";
import ProductFilterBar, {
  type ProductFilterValue,
} from "./components/ProductFilterBar";
import ProductPagination from "./components/ProductPagination";
import ProductListSkeleton from "./components/ProductListSkeleton";
import ProductEmptyState from "./components/ProductEmptyState";
import ProductFilterEmptyState from "./components/ProductFilterEmptyState";
import ProductLoadErrorState from "./components/ProductLoadErrorState";
import AiBatchConfirmModal from "./components/AiBatchConfirmModal";
import BulkArchiveConfirmModal from "./components/BulkArchiveConfirmModal";
import BulkArchiveResultModal from "./components/BulkArchiveResultModal";
import { useAiBatch } from "./context/AiBatchProvider";
import { useBulkArchive } from "./hooks/useBulkArchive";
import { useProductList } from "./hooks/useProductList";
import { useProductInlineEdit } from "./hooks/useProductInlineEdit";
import { isTerminalBatchStatus } from "./lib/aiBatch";
import {
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "./lib/sort";
import {
  clearProductListReturnPending,
  markProductListReturnPending,
  peekProductListReturnPending,
  readProductListViewState,
  saveProductListViewState,
} from "./lib/listViewState";
import type {
  AdminProduct,
  BulkPublishResultItem,
  BulkPublishStatus,
  PublishStatusUpdateResponse,
  SquarePaymentLinkResponse,
  SquareProductionProductResponse,
} from "./types";

// 既存GAS action をそのまま再利用（新しいactionは追加しない）
async function callUpdatePublishStatus(
  productId: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "update_publish_status",
        product_id: productId,
        publish_status: "published",
      }),
    });
    let data: PublishStatusUpdateResponse | null = null;
    try {
      data = (await response.json()) as PublishStatusUpdateResponse;
    } catch {
      data = null;
    }
    if (response.ok && data && data.success === true) {
      return { ok: true };
    }
    // バックエンドの安全なエラー理由を保持して表示する（汎用文で隠さない）
    const message = (data?.message ?? data?.error ?? "").toString().trim();
    const code = (data?.error_code ?? "").toString().trim();
    if (message && code) return { ok: false, message: `${message}（コード: ${code}）` };
    if (message) return { ok: false, message };
    if (code) return { ok: false, message: `公開に失敗しました（コード: ${code}）` };
    return { ok: false };
  } catch (err) {
    console.error("update_publish_status failed:", err);
    return { ok: false };
  }
}

async function callCreateSquarePaymentLink(productId: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "create_square_payment_link",
        product_id: productId,
      }),
    });
    const data = response.ok
      ? ((await response.json()) as SquarePaymentLinkResponse)
      : null;
    return Boolean(response.ok && data && data.success === true);
  } catch (err) {
    console.error("create_square_payment_link failed:", err);
    return false;
  }
}

// Square未連携の商品を Square 本番（Production）へ新規作成する。
// 登録フロー・商品詳細画面と同じ既存 action（create_square_production_product）を再利用する。
// 成功時は Variation ID を返し、取得できなかった場合は後続処理へ進めない。
async function callCreateSquareProductionProduct(
  productId: string
): Promise<{ ok: boolean; variationId?: string; message?: string }> {
  try {
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "create_square_production_product",
        product_id: productId,
      }),
    });
    let data: SquareProductionProductResponse | null = null;
    try {
      data = (await response.json()) as SquareProductionProductResponse;
    } catch {
      data = null;
    }
    if (response.ok && data && data.success === true) {
      const variationId = (data.square_variation_id ?? "").toString().trim();
      return { ok: true, variationId };
    }
    // バックエンドの安全なエラー理由を保持して表示する（汎用文で隠さない）
    const message = (data?.message ?? data?.error ?? "").toString().trim();
    const code = (data?.error_code ?? "").toString().trim();
    if (message && code) return { ok: false, message: `${message}（コード: ${code}）` };
    if (message) return { ok: false, message };
    if (code) {
      return { ok: false, message: `Square商品の作成に失敗しました（コード: ${code}）` };
    }
    return { ok: false };
  } catch (err) {
    console.error("create_square_production_product failed:", err);
    return { ok: false };
  }
}

// 公開前のスニーカーサイズ確認。未入力なら「公開対象外」の理由を返す（対象外でなければ null）。
function sneakerSizeBlockReason(product: AdminProduct): string | null {
  if (product.category !== "sneaker") return null;
  const size = product.sneaker_size;
  const hasSize =
    size != null && String(size).trim() !== "" && String(size).trim() !== "0";
  return hasSize ? null : "公開前にサイズを入力してください";
}

function isBaseEligible(product: AdminProduct): boolean {
  return (
    product.record_status === "active" &&
    product.inventory_status === "in_stock" &&
    (product.planned_sale_price ?? 0) > 0
  );
}

function baseSkipReason(product: AdminProduct): string {
  if (product.record_status !== "active") return "アーカイブ済みの商品のため対象外";
  if (product.inventory_status !== "in_stock") {
    return "在庫状態が「在庫あり」ではないため対象外";
  }
  if (!((product.planned_sale_price ?? 0) > 0)) {
    return "販売予定価格が未設定のため対象外";
  }
  return "対象条件を満たしていないため対象外";
}

// 商品1件を直列処理する。HTTPレスポンスだけでなく data.success === true まで確認済み。
// 処理順: 必要ならSquare商品作成 → Variation ID取得確認 → 公開 → 決済リンクONなら生成。
// Square未連携の商品は、決済リンクの有無にかかわらず必ず Square 本番へ新規作成する。
// 連携済み（square_variation_id あり）の商品は既存IDを再利用し、重複作成しない。
async function processOneProduct(
  product: AdminProduct,
  withPaymentLink: boolean
): Promise<BulkPublishResultItem> {
  const base = {
    product_id: product.product_id,
    product_name: product.product_name || "（商品名なし）",
  };

  // 条件不適合はAPIを呼ばず skipped
  if (!isBaseEligible(product)) {
    return { ...base, status: "skipped", reason: baseSkipReason(product) };
  }

  const needsSquareLink = !product.square_variation_id;
  const needsPublish = product.publish_status !== "published";
  const wantsLink = withPaymentLink && !product.square_checkout_url;

  // すでに連携・公開・決済リンク生成が済んでいる場合は何もしない
  if (!needsSquareLink && !needsPublish && !wantsLink) {
    return {
      ...base,
      status: "already_completed",
      reason: "Square連携・公開・決済リンク生成済み",
    };
  }

  // 公開前にスニーカーサイズ必須。未入力ならAPIを呼ばずに対象外とする（対象商品ごとに判定）。
  if (needsPublish) {
    const sizeReason = sneakerSizeBlockReason(product);
    if (sizeReason) {
      return { ...base, status: "skipped", reason: sizeReason };
    }
  }

  // 1. Square商品作成（未連携のときだけ）。連携済みは既存IDを再利用し、ここは通らない。
  let squareVariationId = (product.square_variation_id ?? "").toString().trim();
  if (needsSquareLink) {
    const createResult = await callCreateSquareProductionProduct(
      product.product_id
    );
    if (!createResult.ok) {
      // 商品作成に失敗したら、この商品の後続処理（公開・決済リンク）は行わない
      return {
        ...base,
        status: "failed",
        reason: createResult.message || "Square商品の作成に失敗しました",
      };
    }
    // Variation IDが取得できたことを確認する（取れなければ後続へ進めない）
    if (!createResult.variationId) {
      return {
        ...base,
        status: "failed",
        reason:
          "Square商品は作成されましたが、Variation IDを取得できませんでした",
      };
    }
    squareVariationId = createResult.variationId;
  }

  // 2. 公開ステップ（必要なときだけ）
  if (needsPublish) {
    const publishResult = await callUpdatePublishStatus(product.product_id);
    if (!publishResult.ok) {
      // Square商品は作成済みだが公開に失敗したため、決済リンクへは進まない
      return {
        ...base,
        status: "failed",
        reason: publishResult.message || "公開に失敗しました",
      };
    }
  }

  // 3. 決済リンク生成ステップ（チェックON かつ 未生成のときだけ）
  if (wantsLink) {
    if (!squareVariationId) {
      return {
        ...base,
        status: "partial_success",
        reason:
          "Square連携（Variation ID）がないため決済リンクを生成できません",
      };
    }
    const linkOk = await callCreateSquarePaymentLink(product.product_id);
    if (linkOk) {
      return { ...base, status: "success" };
    }
    return {
      ...base,
      status: "partial_success",
      reason:
        "決済リンクの生成に失敗しました。Square連携・公開は完了しています。",
    };
  }

  // 決済リンク不要：Square作成・公開までが成功
  return { ...base, status: "success" };
}

interface BulkPlan {
  squareCreate: number;
  publish: number;
  linkOnly: number;
  completed: number;
  skipped: number;
}

function computePlan(
  products: AdminProduct[],
  withPaymentLink: boolean
): BulkPlan {
  const plan: BulkPlan = {
    squareCreate: 0,
    publish: 0,
    linkOnly: 0,
    completed: 0,
    skipped: 0,
  };
  products.forEach((product) => {
    if (!isBaseEligible(product)) {
      plan.skipped += 1;
      return;
    }
    const needsSquareLink = !product.square_variation_id;
    const needsPublish = product.publish_status !== "published";
    const wantsLink = withPaymentLink && !product.square_checkout_url;

    if (!needsSquareLink && !needsPublish && !wantsLink) {
      plan.completed += 1;
      return;
    }

    // 公開前のスニーカーサイズ未入力はスキップとして数える（対象商品ごとに判定）
    if (needsPublish && sneakerSizeBlockReason(product)) {
      plan.skipped += 1;
      return;
    }

    if (needsSquareLink) plan.squareCreate += 1;
    if (needsPublish) {
      plan.publish += 1;
    } else if (wantsLink) {
      plan.linkOnly += 1;
    }
  });
  return plan;
}

const STATUS_LABELS: Record<BulkPublishStatus, string> = {
  success: "成功",
  partial_success: "一部成功",
  already_completed: "処理不要（完了済み）",
  skipped: "スキップ",
  failed: "失敗",
};

const STATUS_STYLES: Record<BulkPublishStatus, string> = {
  success: "bg-primary-100 text-primary-500",
  partial_success: "bg-amber-100 text-amber-800",
  already_completed: "bg-background-100 text-foreground-600",
  skipped: "bg-background-100 text-foreground-600",
  failed: "bg-red-100 text-red-800",
};

const RESULT_STATUS_ORDER: BulkPublishStatus[] = [
  "success",
  "partial_success",
  "already_completed",
  "skipped",
  "failed",
];

export default function ProductsPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const recordStatus = searchParams.get("record_status");
  const isArchived = recordStatus === "archived";

  const locationDeleteMessage = (location.state as { deleteMessage?: string } | null)
    ?.deleteMessage;

  const [reloadKey, setReloadKey] = useState(0);

  // 商品詳細・編集から戻ってきたときだけ、詳細へ移動する直前の表示状態を引き継ぐ。
  // 一覧を新規に開いた場合（フラグなし）は復元しない＝既定の条件から始める。
  const [initialViewState] = useState(() =>
    peekProductListReturnPending(isArchived)
      ? readProductListViewState(isArchived)
      : null
  );

  // 一覧はサーバー側（GAS 商品一覧API v3）で検索・絞り込み・並び替え・ページ分割する。
  // ブラウザ側では取得済みの商品だけを再検索・再ソートしない。
  const {
    loadState,
    products,
    count,
    totalPages,
    filter,
    setFilter,
    sortKey,
    setSortKey,
    page,
    setPage,
  } = useProductList({
    isArchived,
    reloadKey,
    initialState: initialViewState,
  });

  // 初回読み込み（表示できる商品がまだ無い状態）と、一覧表示後の再取得を区別する。
  // 初回はテーブル形式のスケルトン、再取得中は表示中の一覧を保持したまま控えめな更新表示にする
  // （毎回スケルトンに置き換えると画面が大きく跳ねるため）。
  const showSkeleton = loadState === "loading" && products.length === 0;
  const isRefreshing = loadState === "loading" && products.length > 0;

  // 復元判定が終わったらフラグを消す（再読み込みや新規アクセスで復元しないようにする）。
  useEffect(() => {
    clearProductListReturnPending();
  }, []);

  // 詳細へ遷移する直前に、その時点の検索条件・ページ・スクロール位置を残す。
  const rememberListViewState = useCallback(() => {
    saveProductListViewState({
      filter,
      sortKey,
      page,
      scrollY: window.scrollY,
      archived: isArchived,
    });
    markProductListReturnPending(isArchived);
  }, [filter, sortKey, page, isArchived]);

  // 一括選択・一括公開の状態
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [withPaymentLink, setWithPaymentLink] = useState(true);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkPublishResultItem[] | null>(
    null
  );
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 一括AI生成の状態（バッチ受付＋進捗ポーリング。一括公開・決済リンク処理とは別操作）
  // 状態は管理画面共通のプロバイダーが保持する。ここで独自にポーリングしない。
  const [isAiConfirmOpen, setIsAiConfirmOpen] = useState(false);
  const aiBatch = useAiBatch();

  // 一括アーカイブ（既存の単品APIを1件ずつ実行）
  const archive = useBulkArchive();
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);

  // 一覧のインライン編集（下書きの「表示タイトル」「販売予定価格」のみ）。
  // 保存（成功・失敗）後は一覧を再取得して実際の保存値を表示する。
  const inlineEdit = useProductInlineEdit({
    onSaved: () => setReloadKey((k) => k + 1),
  });

  // 一括系の処理中は選択・チェックの操作をまとめてロックする
  const isAnyBulkBusy =
    isBulkProcessing || aiBatch.isBusy || archive.isRunning;

  // 検索・カテゴリ・公開状態・在庫状態のいずれかの絞り込みが適用されているか
  // （絞り込みはGAS側で行われるが、表示メッセージの出し分けに使う）
  const hasFilter =
    filter.search.trim() !== "" ||
    filter.category !== "" ||
    filter.publishStatus !== "" ||
    filter.inventoryStatus !== "";

  // 条件変更時は1ページ目に戻し、選択済みの商品を解除する
  // （一括操作は表示中ページの商品だけを対象にする）。
  const handleFilterChange = (next: ProductFilterValue) => {
    setFilter(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSortChange = (next: ProductSortKey) => {
    setSortKey(next);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handlePageChange = (next: number) => {
    setPage(next);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearFilter = () => {
    setFilter({
      search: "",
      category: "",
      publishStatus: "",
      inventoryStatus: "",
    });
    setPage(1);
    setSelectedIds(new Set());
  };

  // タブ（通常／アーカイブ）を切り替えたら、前のタブの選択を持ち越さない
  useEffect(() => {
    setSelectedIds(new Set());
  }, [isArchived]);

  // 復元したページが、商品件数の減少などで存在しなくなっていた場合は
  // 既存のページング仕様に沿って最終ページ（1ページ以上）に収める。
  useEffect(() => {
    if (loadState !== "success") return;
    const maxPage = Math.max(1, totalPages);
    if (page > maxPage) setPage(maxPage);
  }, [loadState, totalPages, page, setPage]);

  // 一覧の表示（商品行の描画）が終わった後にだけスクロール位置を戻す。
  // 未読み込みの間にスクロールすると無意味なジャンプになるため、成功時のみ実行する。
  const restoreScrollRef = useRef<number | null>(
    initialViewState ? initialViewState.scrollY : null
  );
  useEffect(() => {
    if (loadState !== "success") return;
    const target = restoreScrollRef.current;
    if (target == null) return;
    // 復元したページが存在しない（別ページへ補正される）場合はスクロールを戻さない。
    // 先にスクロールしてしまうと、その直後に一覧が再取得されて不要なジャンプになる。
    if (page > Math.max(1, totalPages)) {
      restoreScrollRef.current = null;
      return;
    }
    restoreScrollRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      // 件数が減った等で元の位置が存在しない場合は、安全に到達できる範囲へ収める
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      window.scrollTo({ top: Math.min(target, maxScroll), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadState, page, totalPages]);

  // バッチが終了状態（完了/一部失敗/失敗）になったら、下書きへ自動反映された
  // 最新の商品名・説明・価格等を表示するため、一覧を再取得する。
  const prevAiTerminal = useRef(false);
  useEffect(() => {
    const terminal = isTerminalBatchStatus(aiBatch.batchStatus);
    if (terminal && !prevAiTerminal.current) {
      setReloadKey((k) => k + 1);
    }
    prevAiTerminal.current = terminal;
  }, [aiBatch.batchStatus]);

  // 全選択チェックボックスの indeterminate 表現（表示中のページの商品を基準にする）
  const pageSelectedCount = useMemo(
    () => products.filter((p) => selectedIds.has(p.product_id)).length,
    [products, selectedIds]
  );
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate =
      pageSelectedCount > 0 && pageSelectedCount < products.length;
  }, [pageSelectedCount, products.length]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.has(product.product_id)),
    [products, selectedIds]
  );

  const plan = useMemo(
    () => computePlan(selectedProducts, withPaymentLink),
    [selectedProducts, withPaymentLink]
  );

  const retry = () => {
    setReloadKey((k) => k + 1);
  };

  const toggleSelect = (productId: string) => {
    if (isAnyBulkBusy) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (isAnyBulkBusy) return;
    const ids = products.map((product) => product.product_id);
    const allSelected =
      ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const runBulkPublish = async () => {
    if (isBulkProcessing) return;
    const targets = selectedProducts;
    setIsBulkConfirmOpen(false);
    setIsBulkProcessing(true);
    setBulkProgress({ done: 0, total: targets.length });

    const results: BulkPublishResultItem[] = [];
    // バックエンドにbatch APIは作らず、1件ずつ直列処理する
    for (let i = 0; i < targets.length; i += 1) {
      const result = await processOneProduct(targets[i], withPaymentLink);
      results.push(result);
      setBulkProgress({ done: i + 1, total: targets.length });
    }

    setIsBulkProcessing(false);
    setBulkResults(results);
  };

  const closeResultModal = () => {
    setBulkResults(null);
    clearSelection();
    setReloadKey((k) => k + 1);
  };

  // 一括アーカイブを開始する（選択中の商品を1件ずつ直列でアーカイブ）
  const runBulkArchive = () => {
    if (archive.isRunning || selectedProducts.length === 0) return;
    setIsArchiveConfirmOpen(false);
    archive.run(selectedProducts);
  };

  const closeArchiveResult = () => {
    archive.dismiss();
    clearSelection();
    // アーカイブ済みは通常一覧から消えるため再取得する
    setReloadKey((k) => k + 1);
  };

  const resultCounts = useMemo(() => {
    if (!bulkResults) return null;
    const counts: Record<BulkPublishStatus, number> = {
      success: 0,
      partial_success: 0,
      already_completed: 0,
      skipped: 0,
      failed: 0,
    };
    bulkResults.forEach((item) => {
      counts[item.status] += 1;
    });
    return counts;
  }, [bulkResults]);

  // 一括AI生成を「一括受付＋進捗取得」で開始する（ブラウザからの直列生成ループは使わない）
  const startAiBatch = async () => {
    if (aiBatch.isBusy || selectedProducts.length === 0) return;
    setIsAiConfirmOpen(false);
    await aiBatch.start(selectedProducts);
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-6">
          <h1 className="min-w-0 text-xl font-semibold text-foreground-950">商品管理</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/import"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              <i className="ri-image-add-line w-4 h-4 flex items-center justify-center"></i>
              画像だけ取込
            </Link>
            <Link
              to="/documents"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
            >
              <i className="ri-file-list-3-line w-4 h-4 flex items-center justify-center"></i>
              書類管理
            </Link>
            <Link
              to="/register"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
              新しい商品を登録
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6">
        {/* 一覧切り替えタブ（下線タイプ。カード状の背景は使わない） */}
        <div className="mb-5 flex items-center gap-6 border-b border-background-200">
          <Link
            to="/products"
            className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              !isArchived
                ? "border-primary-500 text-foreground-950"
                : "border-transparent text-foreground-500 hover:text-foreground-900"
            }`}
          >
            商品一覧
          </Link>
          <Link
            to="/products?record_status=archived"
            className={`-mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              isArchived
                ? "border-primary-500 text-foreground-950"
                : "border-transparent text-foreground-500 hover:text-foreground-900"
            }`}
          >
            アーカイブ済み
          </Link>
        </div>

        {locationDeleteMessage && (
          <p className="mb-6 flex items-center gap-1.5 text-sm font-medium text-primary-700">
            <i className="ri-checkbox-circle-line w-4 h-4 flex items-center justify-center"></i>
            {locationDeleteMessage}
          </p>
        )}

        {/* 読み込み中：商品が未表示のときだけスケルトン（取得完了・エラー・0件で切り替わる） */}
        {showSkeleton && <ProductListSkeleton />}

        {loadState === "error" && <ProductLoadErrorState onRetry={retry} />}

        {(loadState === "success" || isRefreshing) && (
          <>
            {(count > 0 || hasFilter) && (
              <>
                <ProductFilterBar
                  value={filter}
                  onChange={handleFilterChange}
                  disabled={isAnyBulkBusy}
                />

                {/* 件数表示と並び替えを1行にまとめる（検索・フィルター・並び替えに追従） */}
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-foreground-500">
                      {hasFilter ? (
                        <>
                          該当{" "}
                          <span className="font-bold text-foreground-950">
                            {count}
                          </span>{" "}
                          件
                        </>
                      ) : (
                        <>
                          全{" "}
                          <span className="font-bold text-foreground-950">
                            {count}
                          </span>{" "}
                          件
                        </>
                      )}
                      {totalPages > 1 && (
                        <span className="ml-1 text-foreground-400">
                          （{page} / {totalPages} ページ）
                        </span>
                      )}
                    </p>
                    {isRefreshing && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-foreground-400">
                        <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                        更新中
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="product-sort"
                      className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-foreground-500"
                    >
                      <i className="ri-sort-desc w-4 h-4 flex items-center justify-center text-sm"></i>
                      並び替え
                    </label>
                    <select
                      id="product-sort"
                      value={sortKey}
                      disabled={isAnyBulkBusy}
                      onChange={(e) =>
                        handleSortChange(e.target.value as ProductSortKey)
                      }
                      aria-label="商品の並び替え"
                      className="h-9 w-full rounded-md border border-background-300 bg-white px-3 text-xs text-foreground-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {PRODUCT_SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* 一括操作バー（ニュートラルなツールバー。色による強調はしない） */}
            {hasSelection && products.length > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3 rounded-lg border border-background-200 bg-white px-4 py-3">
                <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-foreground-700">
                  <span className="inline-flex h-6 items-center rounded-md bg-background-100 px-2 text-[13px] font-semibold text-foreground-700">
                    {selectedIds.size}件
                  </span>
                  選択中
                </span>
                {isBulkProcessing && (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground-600">
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    処理中 {bulkProgress.done} / {bulkProgress.total}件
                  </span>
                )}
                {archive.isRunning && (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-foreground-600">
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    アーカイブ中 {archive.progress.done} / {archive.progress.total}件
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkConfirmOpen(true)}
                    disabled={isAnyBulkBusy}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-400 bg-white px-3 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:border-background-300 disabled:bg-background-50 disabled:text-foreground-400"
                  >
                    <i className="ri-upload-2-line w-4 h-4 flex items-center justify-center"></i>
                    一括公開
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAiConfirmOpen(true)}
                    disabled={isAnyBulkBusy}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-400 bg-white px-3 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:border-background-300 disabled:bg-background-50 disabled:text-foreground-400"
                  >
                    <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center"></i>
                    一括AI生成
                  </button>
                  {!isArchived && (
                    <button
                      type="button"
                      onClick={() => setIsArchiveConfirmOpen(true)}
                      disabled={isAnyBulkBusy}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-background-400 bg-white px-3 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:border-background-300 disabled:bg-background-50 disabled:text-foreground-400"
                    >
                      <i className="ri-archive-line w-4 h-4 flex items-center justify-center"></i>
                      一括アーカイブ
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={isAnyBulkBusy}
                  className="inline-flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-transparent px-3 text-[13px] font-medium text-foreground-500 transition-colors hover:bg-background-100 hover:text-foreground-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 sm:ml-auto disabled:cursor-not-allowed disabled:bg-transparent disabled:text-foreground-400"
                >
                  <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
                  選択解除
                </button>
              </div>
            )}

            {products.length === 0 ? (
              !hasFilter && count === 0 ? (
                <ProductEmptyState isArchived={isArchived} />
              ) : (
                <ProductFilterEmptyState onClear={handleClearFilter} />
              )
            ) : (
              <div
                aria-busy={isRefreshing}
                className={`overflow-hidden rounded-lg border border-background-200/70 bg-white transition-opacity duration-150 ${
                  isRefreshing ? "opacity-60" : "opacity-100"
                }`}
              >
                {/* 横幅が不足する場合は重ねずに横スクロールで対応する */}
                <div className="overflow-x-auto">
                  <div className="min-w-full lg:min-w-[1240px]">
                    {/* ヘッダー行（デスクトップ） */}
                    <div className="hidden items-center border-b border-background-200 bg-white py-2.5 lg:flex">
                      <div className="flex w-10 shrink-0 items-center justify-center">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={
                            products.length > 0 &&
                            pageSelectedCount === products.length
                          }
                          disabled={isAnyBulkBusy}
                          onChange={toggleSelectAll}
                          aria-label="全選択"
                          className="h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
                        <span className="w-14 shrink-0 text-xs font-medium text-foreground-500">
                          画像
                        </span>
                        <span className="w-[96px] shrink-0 text-xs font-medium text-foreground-500">
                          商品ID
                        </span>
                        <span className="min-w-0 flex-1 text-xs font-medium text-foreground-500">
                          商品名
                        </span>
                        <span className="w-[88px] shrink-0 text-xs font-medium text-foreground-500">
                          カテゴリ
                        </span>
                        <span className="w-[100px] shrink-0 text-right text-xs font-medium text-foreground-500">
                          販売予定価格
                        </span>
                        <span className="w-20 shrink-0 text-xs font-medium text-foreground-500">
                          状態
                        </span>
                        <span className="w-[84px] shrink-0 text-xs font-medium text-foreground-500">
                          公開状態
                        </span>
                        <span className="w-[84px] shrink-0 text-xs font-medium text-foreground-500">
                          在庫状態
                        </span>
                        <span className="w-[110px] shrink-0 text-xs font-medium text-foreground-500">
                          登録日時
                        </span>
                      </div>
                      {/* 行の右端操作列（詳細・別タブ・編集）と同じ幅を確保して桁を揃える */}
                      <div className={`${ACTION_COLUMN_WIDTH} shrink-0`}></div>
                    </div>

                    {products.map((product) => (
                      <ProductRow
                        key={product.product_id}
                        product={product}
                        isSelected={selectedIds.has(product.product_id)}
                        onToggleSelect={toggleSelect}
                        selectDisabled={isAnyBulkBusy}
                        canEdit={
                          product.publish_status === "draft" && !isAnyBulkBusy
                        }
                        isEditing={
                          inlineEdit.editingId === product.product_id
                        }
                        draft={inlineEdit.draft}
                        saving={inlineEdit.savingId === product.product_id}
                        editError={inlineEdit.errors[product.product_id]}
                        onStartEdit={inlineEdit.startEdit}
                        onCancelEdit={inlineEdit.cancelEdit}
                        onDraftChange={inlineEdit.updateDraft}
                        onSave={inlineEdit.save}
                        onNavigateToDetail={rememberListViewState}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <ProductPagination
              page={page}
              totalPages={totalPages}
              count={count}
              disabled={isAnyBulkBusy}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </main>

      {/* 一括公開 確認ダイアログ */}
      {isBulkConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-upload-2-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                一括公開の確認
              </h3>
            </div>
            <p className="mt-3 text-sm text-foreground-700">
              選択中の <span className="font-bold">{selectedIds.size}</span>{" "}
              件を処理します。内容を確認してください。
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-background-100 px-3 py-2">
                <p className="text-[11px] text-foreground-500">
                  Square商品を作成
                </p>
                <p className="text-sm font-bold text-foreground-950">
                  {plan.squareCreate} 件
                </p>
              </div>
              <div className="rounded-md bg-background-100 px-3 py-2">
                <p className="text-[11px] text-foreground-500">公開対象</p>
                <p className="text-sm font-bold text-foreground-950">
                  {plan.publish} 件
                </p>
              </div>
              <div className="rounded-md bg-background-100 px-3 py-2">
                <p className="text-[11px] text-foreground-500">
                  決済リンクのみ生成対象
                </p>
                <p className="text-sm font-bold text-foreground-950">
                  {plan.linkOnly} 件
                </p>
              </div>
              <div className="rounded-md bg-background-100 px-3 py-2">
                <p className="text-[11px] text-foreground-500">
                  処理不要（完了済み）
                </p>
                <p className="text-sm font-bold text-foreground-950">
                  {plan.completed} 件
                </p>
              </div>
              <div className="rounded-md bg-background-100 px-3 py-2">
                <p className="text-[11px] text-foreground-500">スキップ対象</p>
                <p className="text-sm font-bold text-foreground-950">
                  {plan.skipped} 件
                </p>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={withPaymentLink}
                onChange={(e) => setWithPaymentLink(e.target.checked)}
                disabled={isBulkProcessing}
                className="h-4 w-4 cursor-pointer accent-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm font-medium text-foreground-800">
                Square決済リンクも同時に生成する
              </span>
            </label>

            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              <i className="ri-information-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
              Square未連携の商品は、公開前にSquare本番へ新規作成します（連携済みの商品は既存IDを再利用し、重複作成しません）。Square商品の作成に失敗した商品は、公開・決済リンク生成を行わず理由を表示します。Square連携済み商品は、公開時にSquare側の在庫も販売可能状態（在庫1）へ同期されます。
            </p>

            {isBulkProcessing && (
              <div className="mt-3 rounded-md bg-background-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-600"></i>
                  <span className="text-xs font-bold text-foreground-700">
                    処理中 {bulkProgress.done} / {bulkProgress.total}件
                  </span>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                disabled={isBulkProcessing}
                className="whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={runBulkPublish}
                disabled={isBulkProcessing}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBulkProcessing ? (
                  <>
                    <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                    処理中...
                  </>
                ) : (
                  "実行する"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一括公開 結果モーダル */}
      {bulkResults && resultCounts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-file-list-3-line w-5 h-5 flex items-center justify-center text-primary-600"></i>
              <h3 className="text-base font-bold text-foreground-950">
                一括公開の結果
              </h3>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {RESULT_STATUS_ORDER.map((status) => (
                <div
                  key={status}
                  className="rounded-md bg-background-100 px-3 py-2 text-center"
                >
                  <p className="text-[11px] text-foreground-500">
                    {STATUS_LABELS[status]}
                  </p>
                  <p className="text-sm font-bold text-foreground-950">
                    {resultCounts[status]} 件
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-md border border-background-200">
              {bulkResults.map((item) => (
                <div
                  key={item.product_id}
                  className="flex items-start gap-3 border-b border-background-200 px-3 py-2.5 last:border-b-0"
                >
                  <span
                    className={`mt-0.5 inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
                      STATUS_STYLES[item.status]
                    }`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground-950">
                      {item.product_name}
                    </p>
                    <p className="truncate font-mono text-xs text-foreground-500">
                      {item.product_id}
                    </p>
                    {item.reason && (
                      <p className="mt-0.5 text-xs text-foreground-600">
                        {item.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeResultModal}
                className="cursor-pointer whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一括AI生成 確認ダイアログ（一括公開とは別操作） */}
      <AiBatchConfirmModal
        open={isAiConfirmOpen}
        count={selectedIds.size}
        isBusy={aiBatch.isBusy}
        errorMessage={aiBatch.errorMessage}
        onCancel={() => setIsAiConfirmOpen(false)}
        onConfirm={startAiBatch}
      />

      {/* 一括アーカイブ 確認ダイアログ */}
      <BulkArchiveConfirmModal
        open={isArchiveConfirmOpen}
        count={selectedIds.size}
        isRunning={archive.isRunning}
        progress={archive.progress}
        onCancel={() => setIsArchiveConfirmOpen(false)}
        onConfirm={runBulkArchive}
      />

      {/* 一括アーカイブ 結果モーダル */}
      <BulkArchiveResultModal
        results={archive.results}
        counts={archive.counts}
        isRunning={archive.isRunning}
        progress={archive.progress}
        onRetryFailed={archive.retryFailed}
        onReverifyUnknown={archive.reverifyUnknown}
        onClose={closeArchiveResult}
      />
    </div>
  );
}
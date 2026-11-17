import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import AdminLockButton from "./AdminLockButton";
import AddProductMenu from "./AddProductMenu";

export interface AdminHeaderBackLink {
  to: string;
  label: string;
}

export interface AdminHeaderBreadcrumb {
  label: string;
  to: string;
}

export interface AdminHeaderAiHistory {
  onOpen: () => void;
  /** 生成を追跡中か（実行中だけ、件数を出さない控えめな点を添える） */
  processing: boolean;
}

interface AdminHeaderProps {
  pageTitle: string;
  /** 一覧などへ戻る導線（パンくずの親階層として表示する） */
  backLink?: AdminHeaderBackLink;
  /**
   * 現在地より上の階層（2階層以上のパンくず）。
   * 指定した場合は backLink より優先し、現在地（pageTitle）を自動で末尾に足す。
   */
  breadcrumbs?: AdminHeaderBreadcrumb[];
  /** 画面固有の操作（例: ポケカ素地取込）。テキストのみで並べる */
  extras?: ReactNode;
  /** AI生成履歴への入口（履歴を持つ画面だけで表示する） */
  aiHistory?: AdminHeaderAiHistory;
  /**
   * 「商品を追加」を出すか。
   * 商品を扱う画面（商品一覧・商品詳細・Pokémon Card など）だけで true にする。
   */
  showAddProduct?: boolean;
  onOpenNav: () => void;
}

/**
 * 管理画面の共通ヘッダー。
 *
 * すべての管理画面で同じ寸法・余白・文字サイズになるよう、このコンポーネントだけで
 * ロゴ・ページ名・パンくず・操作を組み立てる（画面ごとに個別のヘッダーは作らない）。
 *
 * 左: BIS ブランド（セリフ体ロゴ）＋パンくず／現在のページ名
 * 右: 画面固有の操作 / 商品を追加（商品を扱う画面のみ） / AI生成履歴 / ログアウト
 *
 * 環境切り替えなどの設定はサイドナビの「設定」（/settings）へ集約している。
 */
export default function AdminHeader({
  pageTitle,
  backLink,
  breadcrumbs,
  extras,
  aiHistory,
  showAddProduct = false,
  onOpenNav,
}: AdminHeaderProps) {
  const { isTestMode } = useOperatingMode();

  // 表示するパンくずの階層（現在地は to を持たず、末尾に置く）。
  const ancestors: AdminHeaderBreadcrumb[] = breadcrumbs?.length
    ? breadcrumbs
    : backLink
      ? [{ label: backLink.label, to: backLink.to }]
      : [];

  return (
    <header className="border-b border-background-200 bg-white">
      <div className="flex min-h-[60px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* ナビゲーションを開く（タブレット・スマートフォンのみ。デスクトップは左のサイドバーで開閉する） */}
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="メニューを開く"
            title="メニュー"
            className="product-header-icon-btn shrink-0 lg:hidden"
          >
            <i aria-hidden="true" className="ri-menu-line"></i>
          </button>

          <Link
            to="/products"
            aria-label="BIS 商品一覧の先頭へ"
            className="inline-flex shrink-0 items-center whitespace-nowrap"
          >
            <span className="products-header-brand admin-shell-brand block text-foreground-950">
              BIS
            </span>
          </Link>

          <span
            aria-hidden="true"
            className="h-7 w-px shrink-0 bg-background-300"
          ></span>

          <nav
            aria-label="パンくずリスト"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
          >
            {ancestors.map((crumb, index) => {
              // 階層が深い場合、狭い画面では現在地の1つ上だけを残して省略する
              const isNearestParent = index === ancestors.length - 1;
              return (
                <span
                  key={`${crumb.to}-${index}`}
                  className={`${
                    isNearestParent ? "flex" : "hidden sm:flex"
                  } min-w-0 shrink items-center gap-1.5`}
                >
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-[12px] leading-none text-foreground-300"
                    >
                      ›
                    </span>
                  )}
                  <Link
                    to={crumb.to}
                    title={crumb.label}
                    className="max-w-[200px] cursor-pointer truncate whitespace-nowrap text-[13px] font-normal text-foreground-500 transition-colors hover:text-foreground-900"
                  >
                    {crumb.label}
                  </Link>
                </span>
              );
            })}
            {ancestors.length > 0 && (
              <span
                aria-hidden="true"
                className="shrink-0 text-[12px] leading-none text-foreground-300"
              >
                ›
              </span>
            )}
            {/* ページタイトルは全画面共通（20px / 600）。
                パンくずの有無で大きさを変えない。 */}
            <h1 className="bis-page-title min-w-0 truncate whitespace-nowrap">
              {pageTitle}
            </h1>
            {/* テスト環境のときだけ、見出しの横に控えめな識別ラベルを出す（操作不可） */}
            {isTestMode && (
              <span
                aria-label="テスト環境"
                className="inline-flex h-[20px] shrink-0 select-none items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 text-[11px] font-medium leading-none tracking-[0.06em] text-amber-800"
              >
                TEST
              </span>
            )}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {extras}
          {showAddProduct && <AddProductMenu />}
          {aiHistory && (
            <button
              type="button"
              onClick={aiHistory.onOpen}
              title={
                aiHistory.processing ? "AI生成履歴（実行中）" : "AI生成履歴"
              }
              aria-label={
                aiHistory.processing ? "AI生成履歴（実行中）" : "AI生成履歴"
              }
              className="product-header-icon-btn relative"
            >
              <i aria-hidden="true" className="ri-history-line"></i>
              {aiHistory.processing && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-primary-500"
                ></span>
              )}
            </button>
          )}
          <AdminLockButton />
        </div>
      </div>
    </header>
  );
}
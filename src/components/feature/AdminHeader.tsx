import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import OperatingModeMenu from "./OperatingModeMenu";
import AdminLockButton from "./AdminLockButton";
import AddProductMenu from "./AddProductMenu";

export interface AdminHeaderBackLink {
  to: string;
  label: string;
}

export interface AdminHeaderAiHistory {
  onOpen: () => void;
  /** 生成を追跡中か（実行中だけ、件数を出さない控えめな点を添える） */
  processing: boolean;
}

interface AdminHeaderProps {
  pageTitle: string;
  /** 一覧などへ戻る導線（パンくずとして表示する） */
  backLink?: AdminHeaderBackLink;
  /** 画面固有の操作（例: ポケカ素地取込）。テキストのみで並べる */
  extras?: ReactNode;
  /** AI生成履歴への入口（履歴を持つ画面だけで表示する） */
  aiHistory?: AdminHeaderAiHistory;
  /** サイドナビを折りたたんでいるか（折りたたみ時は開くボタンを常に出す） */
  navCollapsed: boolean;
  onOpenNav: () => void;
}

/**
 * 管理画面の共通ヘッダー。
 *
 * 左: BIS ブランド（セリフ体ロゴ）＋現在のページ名
 * 右: 商品を追加 / AI生成履歴 / 環境設定 / ログアウト
 *
 * カテゴリや機能が増えても、ここにボタンが増え続けないよう
 * 画面移動はサイドナビゲーション側に寄せている。
 */
export default function AdminHeader({
  pageTitle,
  backLink,
  extras,
  aiHistory,
  navCollapsed,
  onOpenNav,
}: AdminHeaderProps) {
  const { isTestMode } = useOperatingMode();

  return (
    <header className="border-b border-background-200 bg-white">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {/* ナビゲーションを開く（スマートフォン・タブレット、または折りたたみ時） */}
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="メニューを開く"
            title="メニュー"
            className={`product-header-icon-btn shrink-0 ${
              navCollapsed ? "" : "lg:hidden"
            }`}
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

          <div className="flex min-w-0 items-baseline gap-2">
            {backLink ? (
              <nav
                aria-label="パンくずリスト"
                className="flex min-w-0 items-center gap-1"
              >
                <Link
                  to={backLink.to}
                  className="cursor-pointer whitespace-nowrap text-[13px] font-medium text-foreground-500 transition-colors hover:text-foreground-900"
                >
                  {backLink.label}
                </Link>
                <i
                  aria-hidden="true"
                  className="ri-arrow-right-s-line flex h-3.5 w-3.5 items-center justify-center text-[14px] text-foreground-300"
                ></i>
                <h1 className="admin-display truncate whitespace-nowrap text-[16px] font-semibold leading-none tracking-[-0.01em] text-foreground-800">
                  {pageTitle}
                </h1>
              </nav>
            ) : (
              <h1 className="admin-display whitespace-nowrap text-[17px] font-semibold leading-none tracking-[-0.01em] text-foreground-800">
                {pageTitle}
              </h1>
            )}
            {/* テスト環境のときだけ、見出しの横に控えめな識別ラベルを出す（操作不可） */}
            {isTestMode && (
              <span
                aria-label="テスト環境"
                className="inline-flex h-[18px] select-none items-center rounded border border-amber-300/70 bg-amber-50 px-1.5 text-[10px] font-medium leading-none tracking-[0.08em] text-amber-800"
              >
                TEST
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {extras}
          <AddProductMenu />
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
          <OperatingModeMenu />
          <AdminLockButton />
        </div>
      </div>
    </header>
  );
}
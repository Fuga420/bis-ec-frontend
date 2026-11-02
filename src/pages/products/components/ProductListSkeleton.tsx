import { ACTION_COLUMN_WIDTH } from "./ProductRow";

// 商品一覧の初回読み込み中に表示するスケルトンUI。
// 実際の一覧テーブルと同じ列構成・列幅・行の高さ（デスクトップは 152px）に合わせて、
// 読み込み完了時にレイアウトが大きく動かないようにしている。
// 件数など未確定の情報は表示しない（誤認防止）。
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];
// プレースホルダの色は #F3F4F6（= background-100）。アニメーションはごく控えめ。
const block = "product-skeleton-block rounded";

export default function ProductListSkeleton() {
  return (
    <div
      className="ui-card overflow-hidden rounded-lg"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">商品一覧を読み込み中...</span>

      {/* 既存テーブルと同じく、幅が足りない場合はこの領域だけが横スクロールする */}
      <div className="overflow-x-auto">
        <div className="min-w-full lg:min-w-[1170px]">
          {/* ヘッダー行（デスクトップ）：実際の列幅に沿ったプレースホルダ */}
          <div className="hidden items-center border-b border-background-200 bg-background-50 py-2.5 lg:flex">
            <div className="flex w-10 shrink-0 items-center justify-center lg:w-9">
              <div className={`h-4 w-4 ${block}`}></div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
              <div className={`h-3 w-[112px] shrink-0 ${block}`}></div>
              <div className={`h-3 w-[240px] shrink-0 flex-1 ${block}`}></div>
              <div className={`h-3 w-[110px] shrink-0 ${block}`}></div>
              <div className={`h-3 w-[120px] shrink-0 ${block}`}></div>
              <div className={`h-3 w-[92px] shrink-0 ${block}`}></div>
              <div className={`h-3 w-[104px] shrink-0 ${block}`}></div>
              <div className={`h-3 w-[120px] shrink-0 ${block}`}></div>
            </div>
            {/* 右端の操作列（詳細・別タブ・編集）と同じ幅を確保して桁を揃える */}
            <div className={`${ACTION_COLUMN_WIDTH} shrink-0`}></div>
          </div>

          {SKELETON_ROWS.map((index) => (
            <div
              key={index}
              className="flex items-stretch border-b border-background-200 last:border-b-0"
            >
              {/* チェックボックス列 */}
              <div className="flex w-10 shrink-0 items-center justify-center lg:w-9">
                <div className={`h-4 w-4 ${block}`}></div>
              </div>

              <div className="min-w-0 flex-1">
                {/* デスクトップ（テーブル）: 実データ行と同じ列幅・最小高さ 152px */}
                <div className="hidden items-center gap-4 px-4 py-4 lg:flex lg:min-h-[152px]">
                  {/* 商品画像はグレーの四角形（実データと同じ112px） */}
                  <div className={`h-28 w-28 shrink-0 rounded-lg ${block}`}></div>
                  {/* 商品名（＋ブランド・補助情報・メタ情報）: 実データと同じ可変幅（最小240px） */}
                  <div className="min-w-[240px] flex-1 space-y-2">
                    <div className={`h-3.5 w-2/3 ${block}`}></div>
                    <div className={`h-3 w-1/3 ${block}`}></div>
                    <div className={`h-[22px] w-[150px] rounded-md ${block}`}></div>
                  </div>
                  {/* カテゴリ */}
                  <div className={`h-3 w-[110px] shrink-0 ${block}`}></div>
                  {/* 販売予定価格 */}
                  <div className={`h-4 w-[120px] shrink-0 ${block}`}></div>
                  {/* 公開状態・在庫状態のバッジ */}
                  <div
                    className={`h-[22px] w-[92px] shrink-0 rounded-md ${block}`}
                  ></div>
                  <div
                    className={`h-[22px] w-[104px] shrink-0 rounded-md ${block}`}
                  ></div>
                  {/* 仕入照合 */}
                  <div
                    className={`h-[22px] w-[120px] shrink-0 rounded-md ${block}`}
                  ></div>
                </div>

                {/* モバイル（カード） */}
                <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
                  <div className={`h-[88px] w-[88px] shrink-0 rounded-lg ${block}`}></div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={`h-3.5 w-2/3 ${block}`}></div>
                    <div className={`h-3 w-1/3 ${block}`}></div>
                    <div className={`h-[22px] w-[150px] rounded-md ${block}`}></div>
                  </div>
                  <div className={`h-3.5 w-16 shrink-0 ${block}`}></div>
                </div>
              </div>

              {/* 右端の操作列（デスクトップは3スロット固定） */}
              <div
                className={`hidden ${ACTION_COLUMN_WIDTH} shrink-0 items-center justify-end gap-1 pr-2 lg:flex`}
              >
                <div className={`h-9 w-9 shrink-0 rounded-lg ${block}`}></div>
                <div className={`h-9 w-9 shrink-0 rounded-lg ${block}`}></div>
                <div className={`h-9 w-9 shrink-0 rounded-lg ${block}`}></div>
              </div>

              {/* モバイルの操作列 */}
              <div className="flex w-12 shrink-0 items-center justify-center lg:hidden">
                <div className={`h-9 w-9 rounded-lg ${block}`}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
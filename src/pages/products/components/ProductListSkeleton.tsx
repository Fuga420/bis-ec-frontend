// 商品一覧の読み込み中に表示するスケルトンUI。
// 実際の一覧（テーブル/カード）と同じ配置に沿った簡素なプレースホルダを 4 行表示する。
// 件数など未確定の情報は表示しない（誤認防止）。
const SKELETON_ROWS = [0, 1, 2, 3];
const bar = "animate-pulse rounded bg-background-200";

export default function ProductListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-background-200 bg-white"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">読み込み中...</span>

      {/* 既存テーブルと同じく、幅が足りない場合はこの領域だけが横スクロールする */}
      <div className="overflow-x-auto">
        <div className="min-w-full lg:min-w-[1160px]">
          {/* ヘッダー行（デスクトップ）：実際の列に沿った薄いプレースホルダ */}
          <div className="hidden items-center border-b border-background-200 bg-background-50 py-2.5 lg:flex">
            <div className="flex w-10 shrink-0 items-center justify-center">
              <div className={`h-4 w-4 ${bar}`}></div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
              <div className={`h-3 w-8 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-12 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-16 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-14 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-16 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-10 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-12 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-12 shrink-0 ${bar}`}></div>
              <div className={`h-3 w-16 shrink-0 ${bar}`}></div>
            </div>
          </div>

          {SKELETON_ROWS.map((index) => (
            <div
              key={index}
              className="flex items-stretch border-b border-background-200 last:border-b-0"
            >
              {/* チェックボックス列 */}
              <div className="flex w-10 shrink-0 items-center justify-center">
                <div className={`h-4 w-4 ${bar}`}></div>
              </div>

              <div className="min-w-0 flex-1">
                {/* デスクトップ（テーブル） */}
                <div className="hidden items-center gap-4 px-4 py-2.5 lg:flex lg:min-h-[80px]">
                  <div className={`h-14 w-14 shrink-0 rounded-md ${bar}`}></div>
                  <div className={`h-3 w-[96px] shrink-0 ${bar}`}></div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={`h-3.5 w-3/4 ${bar}`}></div>
                    <div className={`h-3 w-1/3 ${bar}`}></div>
                  </div>
                  <div className={`h-3 w-[88px] shrink-0 ${bar}`}></div>
                  <div className={`h-3.5 w-[100px] shrink-0 ${bar}`}></div>
                  <div className={`h-3 w-20 shrink-0 ${bar}`}></div>
                  <div
                    className={`h-[22px] w-[72px] shrink-0 rounded-md ${bar}`}
                  ></div>
                  <div
                    className={`h-[22px] w-[72px] shrink-0 rounded-md ${bar}`}
                  ></div>
                  <div className={`h-3 w-[110px] shrink-0 ${bar}`}></div>
                  <div className={`h-4 w-5 shrink-0 ${bar}`}></div>
                </div>

                {/* モバイル（カード） */}
                <div className="flex items-center gap-3 px-4 py-3 lg:hidden">
                  <div className={`h-14 w-14 shrink-0 rounded-md ${bar}`}></div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className={`h-3.5 w-2/3 ${bar}`}></div>
                    <div className={`h-3 w-1/3 ${bar}`}></div>
                    <div className={`h-[22px] w-[110px] rounded-md ${bar}`}></div>
                  </div>
                  <div className={`h-3.5 w-16 shrink-0 ${bar}`}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
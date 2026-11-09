// 商品詳細画面の初回読み込み中に表示するスケルトンUI。
// 実際の詳細画面と同じ骨格（左：画像カード・右：商品情報カード / 説明カード / タブ）に
// 合わせて、読み込み完了時にレイアウトが大きく動かないようにしている。
// 件数など未確定の情報は表示しない（誤認防止）。
// 色・アニメーションは商品一覧のスケルトンと共通（.product-skeleton-block = #F3F4F6）。
const block = "product-skeleton-block rounded";

// 商品情報カードで表示する「ラベル + 値」のマス数（実画面のスペックグリッドと同程度）
const SPEC_CELLS = [0, 1, 2, 3, 4, 5];

export default function ProductDetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">商品情報を読み込み中...</span>

      {/* 画像 + 商品情報 */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] lg:items-start">
        {/* 画像カード */}
        <div className="rounded-lg border border-background-200 bg-white p-2.5 md:p-3">
          <div className={`aspect-square w-full ${block}`}></div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className={`h-14 w-14 shrink-0 ${block}`}></div>
            ))}
          </div>
          <div className={`mt-2.5 h-[32px] w-full ${block}`}></div>
        </div>

        {/* 商品情報カード */}
        <div className="min-w-0 rounded-lg border border-background-200 bg-white p-4 md:p-5">
          <div className="flex gap-1.5">
            <div className={`h-[22px] w-[56px] ${block}`}></div>
            <div className={`h-[22px] w-[56px] ${block}`}></div>
          </div>
          <div className={`mt-2.5 h-6 w-[68%] ${block}`}></div>
          <div className="mt-2 flex flex-wrap gap-4">
            <div className={`h-3 w-[104px] ${block}`}></div>
            <div className={`h-3 w-[84px] ${block}`}></div>
          </div>
          <div className={`mt-4 h-3 w-[64px] ${block}`}></div>
          <div className={`mt-1.5 h-6 w-[120px] ${block}`}></div>

          <div className="mt-4 border-t border-background-200 pt-4">
            <div className={`h-3.5 w-[84px] ${block}`}></div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
              {SPEC_CELLS.map((index) => (
                <div key={index} className="min-w-0">
                  <div className={`h-2.5 w-[56%] ${block}`}></div>
                  <div className={`mt-1.5 h-3 w-[76%] ${block}`}></div>
                </div>
              ))}
            </div>
          </div>

          <div className={`mt-4 h-9 w-[148px] ${block}`}></div>
        </div>
      </div>

      {/* 商品説明カード */}
      <div className="mt-4 rounded-lg border border-background-200 bg-white p-4 md:p-5">
        <div className={`h-4 w-[68px] ${block}`}></div>
        <div className="mt-3 space-y-2">
          <div className={`h-3 w-full ${block}`}></div>
          <div className={`h-3 w-[88%] ${block}`}></div>
          <div className={`h-3 w-[62%] ${block}`}></div>
        </div>
      </div>

      {/* タブ + 管理パネル */}
      <div className="mt-5">
        <div className="inline-flex items-center gap-1 rounded-lg bg-background-100 p-1">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`h-[30px] w-[84px] ${block}`}></div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-background-200 bg-white p-4 md:p-5">
          <div className={`h-4 w-[84px] ${block}`}></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className={`h-[22px] w-[56px] ${block}`}></div>
            <div className={`h-[22px] w-[64px] ${block}`}></div>
            <div className={`h-[22px] w-[56px] ${block}`}></div>
          </div>
          <div className={`mt-4 h-[34px] w-[280px] ${block}`}></div>
          <div className={`mt-3 h-[34px] w-[320px] ${block}`}></div>
        </div>
      </div>
    </div>
  );
}
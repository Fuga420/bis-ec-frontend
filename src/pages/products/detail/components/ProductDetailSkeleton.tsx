// 商品詳細画面の初回読み込み中に表示するスケルトンUI。
// 実際の詳細画面と同じ骨格（左：画像エリア / 右：情報カード＋各パネル）に合わせて、
// 読み込み完了時にレイアウトが大きく動かないようにしている。
// 件数など未確定の情報は表示しない（誤認防止）。
// 色・アニメーションは商品一覧のスケルトンと共通（.product-skeleton-block = #F3F4F6）。
const block = "product-skeleton-block rounded";

// 右側の情報カードで表示する「ラベル + 値」の行数（実画面と同程度）
const INFO_ROWS = [0, 1, 2, 3, 4];

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-[10px] border border-background-200 bg-white p-4 md:p-5">
      {/* 見出し + 右側の状態バッジ */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-4 w-[88px] ${block}`}></div>
          <div className={`h-3 w-[180px] ${block}`}></div>
        </div>
        <div className={`h-[22px] w-[64px] shrink-0 rounded-md ${block}`}></div>
      </div>

      {/* セグメント（タブ切り替え） */}
      <div className="mt-4 inline-flex items-center gap-1 rounded-lg bg-background-100 p-1">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={`h-[30px] w-[72px] rounded-md ${block}`}
          ></div>
        ))}
      </div>

      {/* 保存ボタン */}
      <div className="mt-4 flex items-center gap-3">
        <div className={`h-[36px] w-[132px] rounded-lg ${block}`}></div>
        <div className={`h-3 w-[120px] ${block}`}></div>
      </div>
    </div>
  );
}

export default function ProductDetailSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">商品情報を読み込み中...</span>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* 画像エリア（実画面と同じ 360px 幅） */}
        <div className="w-full lg:w-[360px] lg:shrink-0">
          <div className={`aspect-square w-full rounded-lg ${block}`}></div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={`h-16 w-16 shrink-0 rounded-lg ${block}`}
              ></div>
            ))}
          </div>
          <div className={`mt-3 h-[38px] w-[124px] rounded-lg ${block}`}></div>
        </div>

        {/* 情報エリア */}
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-[10px] border border-background-200 bg-white">
            {/* 商品名・商品ID・ステータス */}
            <div className="border-b border-background-100 p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className={`h-5 w-[70%] ${block}`}></div>
                  <div className={`h-3 w-[92px] ${block}`}></div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    className={`h-[22px] w-[56px] rounded-md ${block}`}
                  ></div>
                  <div
                    className={`h-[22px] w-[56px] rounded-md ${block}`}
                  ></div>
                </div>
              </div>
            </div>

            {/* 商品情報（ラベル + 値の行） */}
            <div className="px-4 py-1 md:px-5">
              {INFO_ROWS.map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 border-b border-background-100 py-2.5 last:border-b-0"
                >
                  <div className={`h-3 w-[72px] shrink-0 ${block}`}></div>
                  <div className={`h-3.5 w-[45%] ${block}`}></div>
                </div>
              ))}
            </div>

            {/* 商品説明・備考 */}
            <div className="border-t border-background-100 px-4 py-3 md:px-5">
              <div className="space-y-2">
                <div className={`h-3 w-[64px] ${block}`}></div>
                <div className={`h-3 w-full ${block}`}></div>
                <div className={`h-3 w-[85%] ${block}`}></div>
              </div>
              <div className="mt-3 space-y-2">
                <div className={`h-3 w-[48px] ${block}`}></div>
                <div className={`h-3 w-[60%] ${block}`}></div>
              </div>
            </div>

            {/* 商品情報を編集 */}
            <div className="border-t border-background-100 px-4 py-3 md:px-5">
              <div className={`h-[38px] w-[148px] rounded-lg ${block}`}></div>
            </div>
          </div>

          {/* 公開状態 / 在庫状態 / レコード状態 のパネル */}
          <div className="mt-4">
            <PanelSkeleton rows={3} />
          </div>
          <div className="mt-4">
            <PanelSkeleton rows={3} />
          </div>
          <div className="mt-4">
            <PanelSkeleton rows={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
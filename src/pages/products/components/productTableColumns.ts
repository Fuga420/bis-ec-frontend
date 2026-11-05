// 商品一覧テーブルの列幅は、ヘッダー行・データ行・読み込み中スケルトンの3か所で
// 必ず同じ値を使う（個別に数値を書くと必ず列がずれるため、ここに集約する）。
//
// 各列は「最小幅（min-width）+ 余剰幅の配分比率（flex-grow）」で決める。
// フルワイド時に商品名列だけが伸びて、右側のステータス列が密集するのを避けるため、
// 余剰幅は全列へ比率で配分する。狭い画面では最小幅を下回らないので、
// テーブル内の横スクロール（既存仕様）で対応する。

// チェックボックス列（44px）
export const COL_CHECKBOX = "w-11 shrink-0";

// 商品画像列（64px）。画像はこの列の中で 64px 角で表示する。
export const COL_IMAGE = "w-16 shrink-0";

// 商品情報列（最小320px / 余剰幅を最も多く受け取る）
export const COL_NAME = "min-w-[320px] flex-[3_1_320px]";

// カテゴリ列（最小132px・左揃え）
export const COL_CATEGORY = "min-w-[132px] flex-[1_1_132px]";

// 販売予定価格列（最小124px・右揃え）
export const COL_PRICE = "min-w-[124px] flex-[1_1_124px]";

// 公開状態列（最小100px）
export const COL_PUBLISH = "min-w-[100px] flex-[0.6_1_100px]";

// 在庫状態列（最小104px）
export const COL_INVENTORY = "min-w-[104px] flex-[0.6_1_104px]";

// 仕入照合列（最小108px）
export const COL_LEDGER = "min-w-[108px] flex-[0.7_1_108px]";

// 行操作列（128px）。詳細・別タブ・編集の3スロットが並ぶ固定幅。
// ヘッダー側でも同じ幅を確保して、アイコンの桁がずれないようにする。
export const ACTION_COLUMN_WIDTH = "w-[128px]";
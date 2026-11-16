/**
 * ヘッダー「商品を追加」メニューの項目定義。
 *
 * ここでは「どの画面で、どの既存フローを出すか」だけを持ち、
 * 登録・取込の処理自体は既存画面（/register, /import）へ遷移するだけに留める。
 * 新しい取込フローや API は作らない。
 *
 * カテゴリ専用ページが増えたときは CATEGORY_ADD_OPTIONS に
 * パスの前方一致と項目を足すだけでよい（表示側は変更不要）。
 */
export interface AddProductOption {
  /** メニュー内で一意なキー */
  key: string;
  /** 主表示の項目名 */
  label: string;
  /** 補助表示の短い説明 */
  description: string;
  /** 既存画面への遷移先（クエリ・パラメータもそのまま維持する） */
  to: string;
}

/** すべての商品画面で使う基本の項目 */
export const BASE_ADD_PRODUCT_OPTIONS: AddProductOption[] = [
  {
    key: "register",
    label: "通常の商品登録",
    description: "画像と商品情報から1点ずつ登録します",
    to: "/register",
  },
  {
    key: "import",
    label: "画像だけ取込",
    description: "画像セットから下書きをまとめて取り込みます",
    to: "/import",
  },
];

interface CategoryAddProductConfig {
  /** このカテゴリ配下とみなすパス（完全一致 or 前方一致） */
  pathPrefix: string;
  /** そのカテゴリ画面でのみ追加する項目 */
  options: AddProductOption[];
}

const CATEGORY_ADD_OPTIONS: CategoryAddProductConfig[] = [
  {
    pathPrefix: "/pokeka",
    options: [
      {
        key: "pokeca-raw-storage",
        label: "ポケカ素地取込",
        description: "箱番・枝番で保管場所を作り、素地をまとめて取り込みます",
        // 従来ヘッダーに独立していた取込ボタンと同じ遷移先・パラメータ
        to: "/import?mode=pokeca_raw_storage",
      },
    ],
  },
];

/**
 * 現在のパスで表示する項目を返す。
 * カテゴリ専用の項目は、そのカテゴリ配下でのみ付与する
 * （ポケカ専用の取込を他の商品画面には出さない）。
 */
export function getAddProductOptions(pathname: string): AddProductOption[] {
  const category = CATEGORY_ADD_OPTIONS.find(
    (config) =>
      pathname === config.pathPrefix ||
      pathname.startsWith(`${config.pathPrefix}/`)
  );
  if (!category) return BASE_ADD_PRODUCT_OPTIONS;
  return [...BASE_ADD_PRODUCT_OPTIONS, ...category.options];
}
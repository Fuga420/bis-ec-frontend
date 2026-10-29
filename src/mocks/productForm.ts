export type CategoryId =
  | "sneaker"
  | "jewelry"
  | "pokemon_card"
  | "apparel"
  | "fashion_goods"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
}

export const categories: Category[] = [
  { id: "sneaker", label: "スニーカー", icon: "ri-footprint-line" },
  { id: "jewelry", label: "ジュエリー", icon: "ri-vip-diamond-line" },
  { id: "pokemon_card", label: "ポケモンカード", icon: "ri-gamepad-line" },
  { id: "apparel", label: "アパレル", icon: "ri-shirt-line" },
  { id: "fashion_goods", label: "ファッション小物", icon: "ri-handbag-line" },
  { id: "other", label: "その他", icon: "ri-more-line" },
];

export interface Condition {
  id: string;
  label: string;
}

export const conditions: Condition[] = [
  { id: "new", label: "新品・未使用" },
  { id: "like_new", label: "未使用に近い" },
  { id: "excellent", label: "目立った傷や汚れなし" },
  { id: "good", label: "やや傷や汚れあり" },
  { id: "fair", label: "傷や汚れあり" },
  { id: "poor", label: "全体的に状態が悪い" },
];

export const sneakerBrands: string[] = [
  "NIKE",
  "adidas",
  "New Balance",
  "ASICS",
  "CONVERSE",
  "VANS",
  "PUMA",
  "Reebok",
  "その他",
];

export const jewelryBrands: string[] = [
  "Tiffany & Co.",
  "Cartier",
  "BVLGARI",
  "Van Cleef & Arpels",
  "HERMÈS",
  "MIKIMOTO",
  "4°C",
  "STAR JEWELRY",
  "その他",
];

export const otherBrands: string[] = [
  "LOUIS VUITTON",
  "GUCCI",
  "PRADA",
  "CHANEL",
  "HERMÈS",
  "その他",
];

export const pokemonBrands: string[] = ["Pokemon Card Game", "その他"];

// アパレル／ファッション小物は既存のブランド欄（セレクト）を使う。
// 新しいブランド選択UIは追加せず、選択肢だけを用意する。
export const apparelBrands: string[] = [
  "Chrome Hearts",
  "LOUIS VUITTON",
  "GUCCI",
  "PRADA",
  "CHANEL",
  "HERMÈS",
  "STÜSSY",
  "COMME des GARÇONS",
  "その他",
];

export const fashionGoodsBrands: string[] = [
  "Chrome Hearts",
  "HERMÈS",
  "LOUIS VUITTON",
  "GUCCI",
  "PRADA",
  "CHANEL",
  "COACH",
  "その他",
];

export const sneakerSizes: string[] = [
  "22.0",
  "22.5",
  "23.0",
  "23.5",
  "24.0",
  "24.5",
  "25.0",
  "25.5",
  "26.0",
  "26.5",
  "27.0",
  "27.5",
  "28.0",
  "28.5",
  "29.0",
  "30.0",
];

export const boxOptions: string[] = ["あり", "なし"];

export const sneakerAccessories: string[] = [
  "タグ",
  "予備のシューレース",
  "購入時の領収書",
  "その他",
];

export const jewelryTypes: string[] = [
  "リング",
  "ネックレス",
  "ピアス",
  "ブレスレット",
  "バングル",
  "ブローチ",
  "その他",
];

export const jewelryMaterials: string[] = [
  "K18 ゴールド",
  "K10 ゴールド",
  "プラチナ",
  "ホワイトゴールド",
  "ピンクゴールド",
  "シルバー925",
  "ステンレス",
  "その他",
];

export const jewelryStones: string[] = [
  "ダイヤモンド",
  "ルビー",
  "サファイア",
  "エメラルド",
  "パール",
  "トパーズ",
  "ガーネット",
  "オパール",
  "なし",
];

export const jewelryShapes: string[] = [
  "ラウンドブリリアント",
  "プリンセス",
  "エメラルド",
  "オーバル",
  "ペアシェイプ",
  "マーキス",
  "クッション",
  "ハート",
];

export const diamondColors: string[] = [
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
];

export const diamondClarity: string[] = [
  "FL",
  "IF",
  "VVS1",
  "VVS2",
  "VS1",
  "VS2",
  "SI1",
  "SI2",
  "I1",
  "I2",
  "I3",
];

export const diamondCut: string[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
];

export const certificateOptions: string[] = ["あり", "なし"];

export const pokemonCardLanguages: string[] = [
  "Japanese",
  "English",
  "Korean",
  "Simplified Chinese",
  "Traditional Chinese",
  "Thai",
  "Indonesian",
];

export const pokemonCardRarities: string[] = [
  "C",
  "U",
  "R",
  "RR",
  "SR",
  "SAR",
  "UR",
  "AR",
  "その他",
];

export const pokemonCardGraders: string[] = [
  "PSA",
  "BGS",
  "CGC",
  "AGS",
  "その他",
];

// 未鑑定ポケモンカードの状態。GAS実装報告に合わせて A / B / C の文字列で保存する。
// 鑑定済みカードでは空文字とし、鑑定会社(grader)・等級(grade)を別項目で扱う。
export const pokemonCardConditions: string[] = ["A", "B", "C"];
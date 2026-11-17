/**
 * ポケカページのメインタブ（グレードの有無）。
 *
 * 以前のタブ（ストレージ／VSS／PSA／その他鑑定）は分類の軸が混在していたため、
 * 「グレードが付いているかどうか」を上位の分類軸にする。
 * 鑑定機関（PSA 等）はメインタブではなく、グレードあり商品の属性として扱う。
 *
 * ただし、一覧API（mode=admin）はグレード情報を返さず、
 * 鑑定状態・鑑定機関・グレード値は商品詳細（pokemon_card）でのみ取得できる。
 * そのため現時点では、グレードありの一覧を推測で組み立てず、
 * 判定条件が整うまで「グレードなし」の既存一覧（旧裏ストレージ）を維持する。
 */
export type PokekaGradeKey = "ungraded" | "graded";

export interface PokekaGradeTab {
  key: PokekaGradeKey;
  label: string;
}

export const POKEKA_GRADE_TABS: PokekaGradeTab[] = [
  { key: "ungraded", label: "グレードなし" },
  { key: "graded", label: "グレードあり" },
];

export const DEFAULT_POKEKA_GRADE: PokekaGradeKey = "ungraded";

export function getPokekaGradeLabel(key: PokekaGradeKey): string {
  return (
    POKEKA_GRADE_TABS.find((tab) => tab.key === key)?.label ??
    POKEKA_GRADE_TABS[0].label
  );
}
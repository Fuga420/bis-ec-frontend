/**
 * 一覧表示用のサイズ表記。
 *
 * 保存値には単位（cm / US / UK / EU など）が含まれていない場合があるため、
 * 画面側で単位を補わず、保存されている値をそのまま表示する。
 * 単位の確認ができない値を勝手に「27.5cm」などと表示しないための処理で、
 * 換算・変換・丸めは一切行わない。
 */
export function formatSneakerSize(size: number | null | undefined): string {
  if (size == null) return "";
  const text = String(size).trim();
  if (text === "") return "";
  // 未入力の 0 は「サイズ未設定」として扱い、空欄にする（「0」を並べない）。
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric === 0) return "";
  return text;
}

/** サイズ列を出せる実データがあるか（全行空欄の列を作らないための判定） */
export function hasSneakerSize(size: number | null | undefined): boolean {
  return formatSneakerSize(size) !== "";
}
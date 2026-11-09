/**
 * 管理画面のテーマ切り替え用クラス。
 *
 * 付与の判断は既存の OperatingModeProvider（isTestMode）だけを参照する。
 * テーマ専用の状態や保存先は新たに持たない。
 */
export const ADMIN_TEST_DARK_CLASS = "is-test-dark";

export function adminThemeClass(isTestMode: boolean): string {
  return isTestMode ? ADMIN_TEST_DARK_CLASS : "";
}
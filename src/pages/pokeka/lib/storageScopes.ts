import { pickRawStorageProducts } from "./rawStorage";
import type { AdminProduct } from "@/pages/products/types";

/**
 * ストレージ内の区分（サブタブ）。
 *
 * 現在確定している分類条件は「旧裏ストレージ」だけなので、
 * 区分ごとの「一覧の対象」「ライト版AIの対象と一致するか」をここ1か所に集約する。
 * 現行ストレージの判定ルールが確定したら、
 *   1) STORAGE_SCOPES の classified を true にする
 *   2) filterProductsByScope に現行の判定を1行足す
 * だけで画面側の構造を変えずに統合できる。
 */
export type StorageScopeKey = "all" | "old" | "current";

export interface StorageScopeDefinition {
  key: StorageScopeKey;
  label: string;
  /** 一覧の対象として分類条件が確定しているか */
  classified: boolean;
  /** ライト版AI（旧裏ストレージ向け）の実行対象と一致するか */
  supportsLightAi: boolean;
  /** サブタブ選択時に添える短い説明 */
  hint: string;
}

export const STORAGE_SCOPES: StorageScopeDefinition[] = [
  {
    key: "all",
    label: "すべて",
    classified: true,
    supportsLightAi: false,
    hint: "現在分類できる商品（旧裏ストレージ）を表示しています",
  },
  {
    key: "old",
    label: "旧裏",
    classified: true,
    supportsLightAi: true,
    hint: "保管場所が「旧裏ストレージ/」で始まる商品",
  },
  {
    key: "current",
    label: "現行",
    classified: false,
    supportsLightAi: false,
    hint: "現行ストレージの分類条件は準備中です",
  },
];

/** 初期表示は「旧裏」。既存の旧裏ストレージ一覧をそのまま開く。 */
export const DEFAULT_STORAGE_SCOPE: StorageScopeKey = "old";

export function getStorageScope(
  key: StorageScopeKey
): StorageScopeDefinition {
  return (
    STORAGE_SCOPES.find((scope) => scope.key === key) ?? STORAGE_SCOPES[0]
  );
}

/**
 * 区分ごとの一覧対象を返す。
 *
 * 「旧裏」= storage_location が「旧裏ストレージ/」で始まる商品（既存の判定をそのまま使用）。
 * 「すべて」= 現時点で判定できる商品の合計。現行が未分類のため、結果的に旧裏と同じ。
 * 「現行」= 判定条件が未確定のため空（推測で分類しない）。
 */
export function filterProductsByScope(
  products: AdminProduct[],
  scope: StorageScopeKey
): AdminProduct[] {
  if (scope === "current") return [];
  return pickRawStorageProducts(products);
}
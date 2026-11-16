/**
 * 管理画面のロック（共有パスワード）に関するブラウザ側の保持だけを扱う小さなモジュール。
 *
 * 重要な前提:
 * - パスワードの正しさはフロントでは判定しない。入力値をそのままAPIへ送り、
 *   API（バックエンド）の照合結果（401 かどうか）にだけ従う。
 * - パスワードの値そのものはコードに埋め込まない。
 * - 保持は localStorage に「入力値」だけを保存する。期限は設けず、
 *   ログアウトするか、APIが401を返す（＝パスワードが変わった）まで使い続ける。
 */

// バックエンド（mode=admin の読み取り）が照合するヘッダー名。
export const ADMIN_PASSWORD_HEADER = "X-Admin-Password";

// 保持キー。既存の他キー（operating_mode など）とは独立させる。
const STORAGE_KEY = "bis.admin.lock.v1";

// 401 を受けたことを画面全体へ知らせるイベント名。
const UNAUTHORIZED_EVENT = "bis:admin-unauthorized";

// 別タブ・同一タブ内で保持状態が変わったことを知らせるイベント名。
const CHANGED_EVENT = "bis:admin-auth-changed";

interface StoredAdminAuth {
  password: string;
}

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readStored(): StoredAdminAuth | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { password?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return null;
    const password = typeof parsed.password === "string" ? parsed.password : "";
    if (!password.trim()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // 以前の保持（expiresAt 付き）も期限を問わずそのまま使う（無期限へ移行）。
    return { password };
  } catch {
    return null;
  }
}

/** 保持中のパスワード（未保持は null）。 */
export function getAdminPassword(): string | null {
  return readStored()?.password ?? null;
}

/** ロック解除済み（保持がある）か。 */
export function isAdminUnlocked(): boolean {
  return readStored() !== null;
}

/**
 * 入力されたパスワードを保持する。
 * 判定は行わず、そのまま保存する（誤っていればAPIが401を返し、ロック画面へ戻る）。
 * 保持は無期限。削除はログアウト（clearAdminPassword）か401のときだけ。
 */
export function saveAdminPassword(password: string): void {
  const value = password;
  if (!value.trim()) return;
  const payload: StoredAdminAuth = { password: value };
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 保存できない環境でも、メモリ上の状態だけでそのセッション中は利用できる。
    }
  }
  emitChanged();
}

/** 保持を削除する（ログアウト）。 */
export function clearAdminPassword(): void {
  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 削除できなくても画面側の状態はロックへ戻す。
    }
  }
  emitChanged();
}

function emitChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/**
 * APIが 401 を返したときに呼ぶ。保持を削除し、画面をロック状態へ戻す。
 * 呼び出し側（fetchラッパー）はフロントで判定せず、レスポンスのステータスだけを見る。
 */
export function notifyAdminUnauthorized(): void {
  clearAdminPassword();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

/** 401（＝ロック画面へ戻す）イベントを購読する。解除関数を返す。 */
export function subscribeAdminUnauthorized(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(UNAUTHORIZED_EVENT, listener);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener);
}

/** 保持状態の変化（ログイン・ログアウト・別タブの変更）を購読する。 */
export function subscribeAdminAuthChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    listener();
  };
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * 管理APIの読み取り用ヘッダー。
 * 未保持のときは何も付けない（ロック画面を経ずに呼ばれた場合はAPIが401を返す）。
 */
export function getAdminReadHeaders(): Record<string, string> {
  const password = getAdminPassword();
  if (!password) return {};
  return { [ADMIN_PASSWORD_HEADER]: password };
}
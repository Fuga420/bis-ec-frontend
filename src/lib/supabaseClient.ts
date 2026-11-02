import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Readdy Backend / SaaS Supabase の接続時に自動注入される公開値。
// 未接続（未注入）の場合は null を返し、呼び出し側でエラー表示する。
const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as
  | string
  | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

// プロジェクト全体で1つのインスタンスを共有する（シングルトン）。
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

export function isBackendConnected(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * 既存の Readdy Backend 接続資格情報（またはアクティブなセッションJWT）から
 * Cloud Run 商品書込API向けの認証ヘッダーを組み立てる。
 * - フロントエンドのソースコードには固定の秘密鍵を一切埋め込まない。
 * - 既存の `documents-relay` / `gas-ai-batch-relay` と同じ環境注入値を利用し、操作の手間を増やさない。
 */
export async function getBackendWriteAuthHeaders(): Promise<Record<string, string>> {
  const key = (SUPABASE_ANON_KEY ?? "").trim();
  if (!key) return {};

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token?.trim();
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch {
      // セッション未取得時は既存の Readdy Backend 接続資格情報を利用
    }
  }

  return headers;
}
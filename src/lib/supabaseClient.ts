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
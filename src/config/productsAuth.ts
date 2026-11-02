import { createClient, type Session, type User } from "@supabase/supabase-js";

/**
 * 商品マスター用 独立Supabaseプロジェクト（wzhgewtkosgxwomlkvmg）のスタッフ認証クライアント。
 * - Readdy内蔵DB用の `src/lib/supabaseClient.ts`（仕入れ書類DB）とは `storageKey` を完全分離する。
 * - ここで使用する `sb_publishable_...` はブラウザ公開用のクライアント識別子であり、共通秘密鍵ではない
 *   （このキー単体では Cloud Run `mode=admin` / `POST /sync` へアクセスできず 401 となる）。
 * - 実際のアクセス可否は、ログイン後のユーザーJWT署名検証＋サーバー側 `public.staff_users` 台帳照合で判定する。
 */
export const PRODUCTS_SUPABASE_URL = (
  (import.meta.env.VITE_PRODUCTS_SUPABASE_URL as string | undefined) ||
  "https://wzhgewtkosgxwomlkvmg.supabase.co"
)
  .trim()
  .replace(/\/+$/, "");

export const PRODUCTS_SUPABASE_PUBLISHABLE_KEY = (
  (import.meta.env.VITE_PRODUCTS_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  "sb_publishable_gEBfy0s43I0hODNAN_7JNQ_37ulfR0M"
).trim();

export const productsAuthClient = createClient(
  PRODUCTS_SUPABASE_URL,
  PRODUCTS_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "bis_ec_staff_auth_v1",
    },
  }
);

export async function getStaffSession(): Promise<Session | null> {
  const { data, error } = await productsAuthClient.auth.getSession();
  if (error || !data?.session) {
    return null;
  }
  return data.session;
}

export async function getStaffAccessToken(): Promise<string | null> {
  const session = await getStaffSession();
  return session?.access_token ?? null;
}

export async function signInStaff(
  email: string,
  password: string
): Promise<{ user: User | null; session: Session | null; error: string | null }> {
  const normalizedEmail = email.trim();
  const { data, error } = await productsAuthClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) {
    return {
      user: null,
      session: null,
      error: error.message || "ログインに失敗しました",
    };
  }
  return {
    user: data.user,
    session: data.session,
    error: null,
  };
}

export async function signOutStaff(): Promise<void> {
  await productsAuthClient.auth.signOut();
}

export function subscribeStaffAuth(
  callback: (session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  } = productsAuthClient.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    subscription.unsubscribe();
  };
}

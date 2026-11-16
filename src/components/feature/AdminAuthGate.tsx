import type { ReactNode } from "react";
import AdminLockScreen from "@/components/feature/AdminLockScreen";
import { useAdminAuth } from "@/context/AdminAuthProvider";

/**
 * 管理画面全体のゲート。
 * 有効なパスワード保持がないときは、画面の中身を描画せずロック画面だけを表示する。
 * （中身を描画しないので、ロック中に管理APIの読み取りは発生しない）
 */
export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const { isUnlocked, notice, unlock } = useAdminAuth();

  if (!isUnlocked) {
    return <AdminLockScreen notice={notice} onSubmit={unlock} />;
  }

  return <>{children}</>;
}
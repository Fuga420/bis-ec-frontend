import { useEffect, useState } from "react";
import type { ProductSyncWarningDetail } from "@/config/productsApi";

/**
 * Google Sheets（正本）への保存成功後に、Cloud Run / Supabase 読取DBへの即時同期が失敗した場合のみ表示する非ブロッキング通知バナー。
 * ログインや画面遷移は一切遮断せず、Muse AI や複数スタッフの操作を止めない。
 */
export default function ProductSyncWarningBanner() {
  const [warning, setWarning] = useState<ProductSyncWarningDetail | null>(null);

  useEffect(() => {
    const handleSyncWarning = (event: Event) => {
      const custom = event as CustomEvent<ProductSyncWarningDetail>;
      if (custom.detail) {
        setWarning(custom.detail);
      }
    };
    window.addEventListener("bis:product-sync-warning", handleSyncWarning);
    return () => {
      window.removeEventListener("bis:product-sync-warning", handleSyncWarning);
    };
  }, []);

  if (!warning) return null;

  return (
    <div
      role="status"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-4"
    >
      <span>
        正本（Google Sheets）への保存は完了しましたが、高速読取DBへの即時反映で一時エラーが発生しました（商品ID:{" "}
        <strong className="font-mono">{warning.productId}</strong> / {warning.error}
        ）。自動的に正本参照および定期再同期（5分周期）で補完されます。
      </span>
      <button
        type="button"
        onClick={() => setWarning(null)}
        className="shrink-0 text-amber-800 underline hover:text-amber-950 cursor-pointer"
      >
        閉じる
      </button>
    </div>
  );
}

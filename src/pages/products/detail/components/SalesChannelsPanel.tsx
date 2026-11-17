import type { AdminProductDetail } from "@/pages/products/types";
import SquareIntegrationSection from "./SquareIntegrationSection";
import ChannelListingsPanel from "./ChannelListingsPanel";

interface SalesChannelsPanelProps {
  product: AdminProductDetail;
  onRefreshed: () => Promise<void>;
}

// 自動連携が未実装のチャネル（表示のみ。架空の状態・ID・実行ボタンは持たせない）
const PENDING_INTEGRATION_CHANNELS = ["メルカリShops", "スニダン"];

/**
 * 商品詳細「出品チャネル」タブ。
 *
 * 上段に自動連携（現時点ではSquareのみ）、下段にチャネル別の出品状況（手動管理）を置く。
 * 将来メルカリShops・スニダン等の連携を追加する場合は、
 * 連携セクションを1つ追加し、PENDING_INTEGRATION_CHANNELS から該当チャネルを外すだけでよい。
 */
export default function SalesChannelsPanel({
  product,
  onRefreshed,
}: SalesChannelsPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SquareIntegrationSection product={product} onRefreshed={onRefreshed} />
        {PENDING_INTEGRATION_CHANNELS.length > 0 && (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-foreground-400">
            <span className="whitespace-nowrap">自動連携</span>
            {PENDING_INTEGRATION_CHANNELS.map((label) => (
              <span
                key={label}
                className="inline-flex h-[20px] items-center whitespace-nowrap rounded border border-background-300 bg-white px-1.5 text-[10.5px] leading-none text-foreground-400"
              >
                {label} 準備中
              </span>
            ))}
          </p>
        )}
      </section>

      <div className="border-t border-background-200 pt-4">
        <ChannelListingsPanel productId={product.product_id} />
      </div>
    </div>
  );
}
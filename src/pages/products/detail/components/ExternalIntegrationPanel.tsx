import type { ReactNode } from "react";
import type { AdminProductDetail } from "@/pages/products/types";
import CataloguePanelHeading from "./CataloguePanelHeading";
import SquareIntegrationSection from "./SquareIntegrationSection";

interface ExternalIntegrationSectionProps {
  product: AdminProductDetail;
  onRefreshed: () => Promise<void>;
}

/**
 * 外部連携タブ（販売チャネルへの商品情報・在庫・決済の連携管理）。
 *
 * サービス単位のまとまりを縦に並べるだけの入れ物で、
 * 連携の中身（状態・条件・操作・技術情報）は各サービスのセクションが持つ。
 * 将来メルカリShops・スニダン等を追加する場合は、
 * 対応するセクションをこの一覧に1つ足すだけで並べられる構造にしている。
 */
export default function ExternalIntegrationPanel({
  product,
  onRefreshed,
}: ExternalIntegrationSectionProps) {
  // 現在連携できるサービス（現時点ではSquareのみ）
  const services: Array<{ key: string; node: ReactNode }> = [
    {
      key: "square",
      node: (
        <SquareIntegrationSection product={product} onRefreshed={onRefreshed} />
      ),
    },
  ];

  return (
    <section>
      <CataloguePanelHeading title="外部連携" />
      <p className="mt-1.5 max-w-[70ch] text-[12px] leading-relaxed text-foreground-500">
        販売チャネルごとの連携状態と、本番環境への反映を管理します。
      </p>

      <div className="mt-4 flex flex-col gap-5">
        {services.map((service) => (
          <div
            key={service.key}
            className="border-t border-background-200 pt-4"
          >
            {service.node}
          </div>
        ))}
      </div>
    </section>
  );
}
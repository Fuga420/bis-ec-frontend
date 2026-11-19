import type { AdminProductDetail } from "@/pages/products/types";
import CatalogueDescription from "./CatalogueDescription";
import CatalogueConditionReport from "./CatalogueConditionReport";
import CatalogueSectionHeading from "./CatalogueSectionHeading";

interface ProductDescriptionSectionProps {
  product: AdminProductDetail;
}

/**
 * 商品詳細の「商品説明」セクション。
 */
export default function ProductDescriptionSection({
  product,
}: ProductDescriptionSectionProps) {
  return (
    <div className="mt-5 rounded-lg border border-background-200 bg-white p-4 md:p-5">
      <CatalogueSectionHeading title="商品説明" />

      <div className="mt-3">
        <div className="flex flex-col gap-4">
          <CatalogueDescription product={product} showHeading={false} />
          <div className="border-t border-background-100 pt-4">
            <CatalogueConditionReport product={product} />
          </div>
        </div>
      </div>
    </div>
  );
}
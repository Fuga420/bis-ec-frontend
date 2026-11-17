import { Link } from "react-router-dom";
import ProductThumbnail from "@/pages/products/components/ProductThumbnail";
import { getProductDisplayTitle } from "@/pages/products/lib/productTitle";
import type { AdminProduct } from "@/pages/products/types";
import { formatHomeDateTime } from "@/pages/home/lib/homeData";

interface HomeRecentProductsProps {
  products: AdminProduct[];
}

/**
 * 最近登録された商品。
 * 全体の登録日時順（新しい順）が保証できた場合だけ親が呼び出す。
 * 画像・商品名・商品ID・登録日時だけを並べ、クリックで既存の商品詳細へ移動する。
 */
export default function HomeRecentProducts({
  products,
}: HomeRecentProductsProps) {
  return (
    <ul className="divide-y divide-background-200">
      {products.map((product) => {
        const name = getProductDisplayTitle(product);
        return (
          <li key={product.product_id}>
            <Link
              to={`/products/${product.product_id}`}
              className="-mx-1 flex cursor-pointer items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-background-50"
            >
              <ProductThumbnail
                src={product.main_image_display_url}
                alt={name}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <p
                  title={name}
                  className="truncate text-[13px] font-semibold leading-[1.4] text-foreground-950"
                >
                  {name}
                </p>
                <div className="admin-meta mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-foreground-500">
                  <span className="admin-numeric shrink-0 whitespace-nowrap">
                    {product.product_id}
                  </span>
                  <span className="admin-numeric shrink-0 whitespace-nowrap text-foreground-400">
                    {formatHomeDateTime(product.created_at)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
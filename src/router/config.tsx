import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import RegisterPage from "@/pages/register/page";
import ImportPage from "@/pages/import/page";
import ProductsPage from "@/pages/products/page";
import ProductDetailPage from "@/pages/products/detail/page";
import DocumentsPage from "@/pages/documents/page";
import DocumentDetailPage from "@/pages/documents/detail/page";

const routes: RouteObject[] = [
  {
    // トップページは商品一覧（商品管理）画面
    path: "/",
    element: <ProductsPage />,
  },
  {
    path: "/register",
    element: <RegisterPage />,
  },
  {
    path: "/import",
    element: <ImportPage />,
  },
  {
    path: "/products",
    element: <ProductsPage />,
  },
  {
    path: "/products/:id",
    element: <ProductDetailPage />,
  },
  {
    path: "/documents",
    element: <DocumentsPage />,
  },
  {
    path: "/documents/:id",
    element: <DocumentDetailPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
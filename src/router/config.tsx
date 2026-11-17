import type { RouteObject } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import RegisterPage from "@/pages/register/page";
import ImportPage from "@/pages/import/page";
import ProductsPage from "@/pages/products/page";
import HomePage from "@/pages/home/page";
import ProductDetailPage from "@/pages/products/detail/page";
import PokekaPage from "@/pages/pokeka/page";
import SneakersPage from "@/pages/sneakers/page";
import ChromeHeartsPage from "@/pages/chrome-hearts/page";
import ApparelPage from "@/pages/apparel/page";
import DocumentsPage from "@/pages/documents/page";
import SettingsPage from "@/pages/settings/page";
import DocumentDetailPage from "@/pages/documents/detail/page";
import RelayCheckPage from "@/pages/dev/relay-check/page";

const routes: RouteObject[] = [
  {
    // トップページは商品一覧（商品管理）画面
    path: "/",
    element: <ProductsPage />,
  },
  {
    // 業務全体の状況を確認するホーム（商品一覧とは役割を分ける）
    path: "/home",
    element: <HomePage />,
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
    // ポケカ専用の商品管理画面（ストレージ（旧裏）／VSS／PSA／その他鑑定）
    path: "/pokeka",
    element: <PokekaPage />,
  },
  {
    // カテゴリ別の商品一覧（商品マスターは共通のまま、入口だけを分ける）
    path: "/sneakers",
    element: <SneakersPage />,
  },
  {
    // Chrome Hearts専用の商品一覧（ブランド名で対象を絞る）
    path: "/chrome-hearts",
    element: <ChromeHeartsPage />,
  },
  {
    // Apparel専用の商品一覧（商品種別 apparel で対象を絞る）
    path: "/apparel",
    element: <ApparelPage />,
  },
  {
    path: "/documents",
    element: <DocumentsPage />,
  },
  {
    // 設定（環境切り替え・ログアウト）をサイドナビから開く
    path: "/settings",
    element: <SettingsPage />,
  },
  {
    path: "/documents/:id",
    element: <DocumentDetailPage />,
  },
  {
    // documents-relay の配信内容を実リクエストで確認する一時的な検証画面
    path: "/dev/relay-check",
    element: <RelayCheckPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
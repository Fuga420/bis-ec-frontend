import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { AiBatchProvider } from "@/pages/products/context/AiBatchProvider";
import AiBatchProgressBar from "@/components/feature/AiBatchProgressBar";
import ProductSyncWarningBanner from "@/components/feature/ProductSyncWarningBanner";
import { OperatingModeProvider } from "@/context/OperatingModeProvider";
import { AdminAuthProvider } from "@/context/AdminAuthProvider";
import AdminAuthGate from "@/components/feature/AdminAuthGate";


function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter basename={__BASE_PATH__}>
        <OperatingModeProvider>
          {/* 管理画面のロック（共有パスワード）。未解除の間は中身を描画しない */}
          <AdminAuthProvider>
            <AdminAuthGate>
              {/* AI一括生成の状態は管理画面全体で1つだけ持つ（ポーリングは1系統） */}
              <AiBatchProvider>
                <AiBatchProgressBar />
                <ProductSyncWarningBanner />
                <AppRoutes />
              </AiBatchProvider>
            </AdminAuthGate>
          </AdminAuthProvider>
        </OperatingModeProvider>
      </BrowserRouter>
    </I18nextProvider>
  );
}

export default App;

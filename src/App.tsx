import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { AiBatchProvider } from "@/pages/products/context/AiBatchProvider";
import AiBatchProgressBar from "@/components/feature/AiBatchProgressBar";


function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter basename={__BASE_PATH__}>
        {/* AI一括生成の状態は管理画面全体で1つだけ持つ（ポーリングは1系統） */}
        <AiBatchProvider>
          <AiBatchProgressBar />
          <AppRoutes />
        </AiBatchProvider>
      </BrowserRouter>
    </I18nextProvider>
  );
}

export default App;

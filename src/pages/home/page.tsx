import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import HomeDateLabel from "./components/HomeDateLabel";
import HomeProductOverview from "./components/HomeProductOverview";
import HomeQuickAccess from "./components/HomeQuickAccess";
import HomeSection from "./components/HomeSection";
import HomeWorkStatus from "./components/HomeWorkStatus";
import { useHomeSummary } from "./hooks/useHomeSummary";

export default function HomePage() {
  const { isTestMode } = useOperatingMode();
  const summary = useHomeSummary(isTestMode);

  return (
    <AdminShell
      pageTitle="ホーム"
      mainClassName="page-fade w-full px-4 py-4 md:px-6 md:py-5 lg:px-8"
    >
      <div className="flex w-full flex-col gap-3">
        <HomeDateLabel />

        <HomeSection title="商品概要">
          <HomeProductOverview
            state={summary.productState}
            products={summary.products}
            onReload={summary.reloadProducts}
          />
        </HomeSection>

        <HomeSection title="作業状況">
          <HomeWorkStatus
            documentState={summary.documentState}
            documents={summary.documents}
            onReloadDocuments={summary.reloadDocuments}
          />
        </HomeSection>

        <HomeSection title="クイックアクセス">
          <HomeQuickAccess />
        </HomeSection>
      </div>
    </AdminShell>
  );
}
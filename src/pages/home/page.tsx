import AdminShell from "@/components/feature/AdminShell";
import { useOperatingMode } from "@/context/OperatingModeProvider";
import HomeAttentionStatus from "./components/HomeAttentionStatus";
import HomeCategoryStats from "./components/HomeCategoryStats";
import HomeDateLabel from "./components/HomeDateLabel";
import HomeProductOverview from "./components/HomeProductOverview";
import HomeQuickAccess from "./components/HomeQuickAccess";
import HomeRecentProducts from "./components/HomeRecentProducts";
import HomeSection from "./components/HomeSection";
import HomeWorkStatus from "./components/HomeWorkStatus";
import { useHomeSummary } from "./hooks/useHomeSummary";

export default function HomePage() {
  const { isTestMode } = useOperatingMode();
  const summary = useHomeSummary(isTestMode);

  // 最近の商品は、全体の登録日時順を保証できたときだけ表示する
  // （取得できない・順序を保証できない場合はセクションごと出さない）。
  const showRecentProducts =
    summary.recentState === "success" && summary.recentProducts.length > 0;

  return (
    <AdminShell
      pageTitle="ホーム"
      mainClassName="page-fade mx-auto w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-5 lg:px-8"
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

        <HomeSection title="カテゴリ別商品">
          <HomeCategoryStats
            state={summary.categoryState}
            categories={summary.categories}
            onReload={summary.reloadProducts}
          />
        </HomeSection>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <HomeSection title="要確認項目">
            <HomeAttentionStatus
              state={summary.attentionState}
              attention={summary.attention}
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
        </div>

        {showRecentProducts && (
          <HomeSection title="最近の商品">
            <HomeRecentProducts products={summary.recentProducts} />
          </HomeSection>
        )}

        <HomeSection title="クイックアクセス">
          <HomeQuickAccess />
        </HomeSection>
      </div>
    </AdminShell>
  );
}
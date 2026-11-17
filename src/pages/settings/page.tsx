import AdminShell from "@/components/feature/AdminShell";
import OperatingModeSettings from "./components/OperatingModeSettings";
import SettingsSection from "./components/SettingsSection";

/**
 * 設定。環境切り替えなどの既存設定を表示する。
 * ログアウトはヘッダー右端の1か所に統一したため、ここには置かない。
 */
export default function SettingsPage() {
  return (
    <AdminShell
      pageTitle="設定"
      mainClassName="page-fade w-full px-4 py-4 md:px-6 md:py-5 lg:px-8"
    >
      <div className="flex w-full flex-col gap-3">
        <SettingsSection title="環境">
          <OperatingModeSettings />
        </SettingsSection>
      </div>
    </AdminShell>
  );
}
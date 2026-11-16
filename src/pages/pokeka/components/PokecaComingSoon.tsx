interface PokecaComingSoonProps {
  label: string;
}

/** VSS／PSA／その他鑑定タブの受け皿（該当商品の判定方法が未定のため一覧は出さない）。 */
export default function PokecaComingSoon({ label }: PokecaComingSoonProps) {
  return (
    <div className="ui-card flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground-700">
        {label}は準備中です
      </p>
    </div>
  );
}
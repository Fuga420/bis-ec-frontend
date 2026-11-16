interface PokecaComingSoonProps {
  label: string;
  description: string;
  icon: string;
}

/** VSS／PSA／その他鑑定タブの受け皿（該当商品の判定方法が未定のため一覧は出さない）。 */
export default function PokecaComingSoon({
  label,
  description,
  icon,
}: PokecaComingSoonProps) {
  return (
    <div className="ui-card flex flex-col items-center justify-center rounded-lg px-6 py-14 text-center">
      <i
        className={`${icon} mb-2 flex h-8 w-8 items-center justify-center text-[22px] text-foreground-400`}
        aria-hidden="true"
      ></i>
      <p className="text-sm font-medium text-foreground-700">
        {label}は準備中です
      </p>
      <p className="mt-1 max-w-xl text-xs leading-relaxed text-foreground-500">
        {description}
      </p>
    </div>
  );
}
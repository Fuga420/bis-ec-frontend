import { Link } from "react-router-dom";

// 既存画面への導線のみ。新しい画面は作らない。
const QUICK_LINKS = [
  { label: "商品登録", to: "/register" },
  { label: "画像だけ取込", to: "/import" },
  { label: "仕入・書類", to: "/documents" },
  { label: "Pokémon Card", to: "/pokeca" },
];

/**
 * よく使う機能への導線。アイコンや説明文は付けず、
 * 文字だけのリンクを十分な高さで並べる。
 */
export default function HomeQuickAccess() {
  return (
    <ul className="grid grid-cols-2 gap-1 md:grid-cols-4">
      {QUICK_LINKS.map((item) => (
        <li key={item.to} className="min-w-0">
          <Link
            to={item.to}
            className="flex min-h-[44px] cursor-pointer items-center rounded-md px-3 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 hover:text-foreground-950"
          >
            <span className="truncate">{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
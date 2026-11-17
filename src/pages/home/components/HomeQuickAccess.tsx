import { Link } from "react-router-dom";

// 既存画面への導線のみ。新しい画面・機能は作らない。
const QUICK_LINKS = [
  { label: "商品登録", to: "/register" },
  { label: "画像だけ取込", to: "/import" },
  { label: "仕入・書類", to: "/documents" },
  { label: "Pokémon Card", to: "/pokeca" },
];

/**
 * よく使う機能への導線。アイコンや説明文は付けず、
 * 高さ34pxの文字だけの小さなリンクを折り返しで並べる。
 */
export default function HomeQuickAccess() {
  return (
    <ul className="flex flex-wrap gap-2">
      {QUICK_LINKS.map((item) => (
        <li key={item.to} className="min-w-0">
          <Link
            to={item.to}
            className="bis-btn bis-btn-secondary bis-btn-sm cursor-pointer"
          >
            <span className="truncate">{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
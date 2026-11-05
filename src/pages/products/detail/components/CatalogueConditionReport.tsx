import type { AdminProductDetail } from "@/pages/products/types";
import { parseTaggedDescription } from "../lib/descriptionExtract";
import { hasText } from "../lib/format";
import CatalogueSectionHeading from "./CatalogueSectionHeading";

/**
 * 状態報告として抜き出す項目のラベル候補。
 * 商品説明の【状態】【使用歴】【付属品】などを拾い、
 * 説明文に無い場合は商品マスタの値で補う。
 */
export const CONDITION_FIELD_KEYS = {
  state: ["商品状態", "コンディション", "状態"],
  usage: ["使用歴", "使用期間", "使用頻度", "使用状況", "着用回数"],
  accessories: ["付属品", "付属", "付属品等"],
} as const;

const REPORT_FIELDS: { label: string; keys: readonly string[] }[] = [
  { label: "状態", keys: CONDITION_FIELD_KEYS.state },
  { label: "使用歴", keys: CONDITION_FIELD_KEYS.usage },
  { label: "付属品", keys: CONDITION_FIELD_KEYS.accessories },
];

/** 状態報告で使用するラベルかどうか（商品説明の本文側から除外するために使う） */
export function isConditionReportLabel(label: string): boolean {
  const normalized = label.replace(/\s/g, "");
  return REPORT_FIELDS.some((field) =>
    field.keys.some((key) => normalized.includes(key))
  );
}

function findFieldValue(
  fields: ReturnType<typeof parseTaggedDescription>["fields"],
  keys: readonly string[]
): string {
  const hit = fields.find((field) =>
    keys.some((key) => field.label.replace(/\s/g, "").includes(key))
  );
  return hit ? hit.values.join(" / ") : "";
}

interface CatalogueConditionReportProps {
  product: AdminProductDetail;
}

/**
 * 商品詳細の「状態報告」。
 * 状態・使用歴・付属品だけを薄い罫線の表にまとめる。
 * 値が無い項目は行ごと出さない（空欄を並べない）。
 * 表示専用で、保存データには関与しない。
 */
export default function CatalogueConditionReport({
  product,
}: CatalogueConditionReportProps) {
  const parsed = parseTaggedDescription(product.description ?? "");

  const fallbackCondition =
    product.category === "pokemon_card"
      ? product.pokemon_card?.card_condition ?? ""
      : product.condition ?? "";

  const values: Record<string, string> = {
    状態:
      findFieldValue(parsed.fields, CONDITION_FIELD_KEYS.state) ||
      fallbackCondition,
    使用歴: findFieldValue(parsed.fields, CONDITION_FIELD_KEYS.usage),
    付属品:
      findFieldValue(parsed.fields, CONDITION_FIELD_KEYS.accessories) ||
      product.sneaker_accessories ||
      "",
  };

  const rows = REPORT_FIELDS.map((field) => ({
    label: field.label,
    value: (values[field.label] ?? "").trim(),
  })).filter((row) => hasText(row.value));

  if (rows.length === 0) return null;

  return (
    <section>
      <CatalogueSectionHeading title="状態報告" />
      <dl className="mt-2 divide-y divide-background-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)]"
          >
            <dt className="text-[12px] leading-5 text-foreground-500">
              {row.label}
            </dt>
            <dd className="min-w-0 break-words text-[13px] leading-6 text-foreground-800">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
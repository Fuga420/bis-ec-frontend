import type { AdminProductDetail } from "@/pages/products/types";
import { parseTaggedDescription } from "../lib/descriptionExtract";
import { hasText } from "../lib/format";
import SectionHeading from "./SectionHeading";
import CollapsibleText from "./CollapsibleText";

interface ProductSpecPanelProps {
  product: AdminProductDetail;
}

/** 本文から抜き出した項目（【状態】など）を、上部スペックと同じ定義リスト形式で表示する */
function ExtractedFields({
  fields,
}: {
  fields: ReturnType<typeof parseTaggedDescription>["fields"];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-lg border border-background-200 bg-background-50 px-3 py-2.5 sm:grid-cols-2 md:grid-cols-3">
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="text-[11px] leading-4 text-foreground-500">
            {field.label}
          </dt>
          <dd className="mt-0.5 text-[13px] font-medium leading-relaxed text-foreground-900">
            {field.values.join(" / ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** ハッシュタグは淡いグレーのピルにして「文章ではない」と見た目で分かるようにする */
function HashtagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center rounded-full bg-background-100 px-2 py-0.5 text-[11px] font-medium leading-5 text-foreground-600"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/**
 * 商品詳細の「商品説明・備考」セクション（表示専用）。
 *
 * 長文をそのまま並べるのではなく、読み手が拾いやすい形に分解する:
 *  1. 【状態】【付属品】【サイズ】など本文中の項目は、上部スペックと同じ
 *     定義リスト形式で本文より先に「要点」として置く
 *  2. 残った文章だけを本文として段落表示し、長い場合は5行で折りたたむ
 *  3. ハッシュタグは本文から外してチップにする
 *  4. 注意事項（※書き）は本文と分け、アンバーの縦線を引いた注記ブロックにする
 *
 * 未入力の項目は「—」を並べず、入力済みの項目だけを表示する。
 */
export default function ProductSpecPanel({ product }: ProductSpecPanelProps) {
  const description = product.description ?? "";
  const parsed = parseTaggedDescription(description);
  const hasExtractedFields = parsed.fields.length > 0;
  const hasDescriptionBody = hasText(parsed.lead);
  const hasTags = parsed.hashtags.length > 0;
  const hasDescription =
    hasExtractedFields || hasDescriptionBody || hasTags;
  const hasNotes = hasText(product.notes ?? "");
  const hasAny = hasDescription || hasNotes;

  return (
    <div className="ui-card rounded-lg">
      <div className="border-b border-background-100 px-4 py-3 md:px-5">
        <SectionHeading
          eyebrow="Description"
          title="商品説明・備考"
          icon="ri-file-text-line"
          right={
            !hasAny ? (
              <span className="whitespace-nowrap rounded-md bg-background-100 px-2 py-0.5 text-[10px] font-medium text-foreground-500">
                未入力
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
        {hasAny ? (
          <>
            {hasExtractedFields && <ExtractedFields fields={parsed.fields} />}

            {hasDescriptionBody && (
              <div>
                <p className="text-[11px] font-medium text-foreground-500">
                  商品説明
                </p>
                <CollapsibleText
                  text={parsed.lead}
                  collapsedLines={5}
                  threshold={160}
                  className="mt-1"
                />
              </div>
            )}

            <HashtagChips tags={parsed.hashtags} />

            {hasNotes && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-foreground-500">
                  注意事項・備考
                </p>
                {/* ※書きは本文と混ぜず、アンバーの縦線を引いた注記ブロックに分離する */}
                <div className="rounded-r-md border-l-2 border-amber-400 bg-amber-50/50 py-2 pl-3 pr-2">
                  <CollapsibleText
                    text={product.notes ?? ""}
                    collapsedLines={3}
                    threshold={120}
                    tone="muted"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-foreground-400">
            <i className="ri-file-text-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
            <span className="min-w-0 flex-1">
              商品説明・備考はまだ入力されていません。「商品情報を編集」から追加できます。
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
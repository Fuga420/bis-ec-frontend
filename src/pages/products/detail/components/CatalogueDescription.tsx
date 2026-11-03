import { useMemo, useState } from "react";
import type { AdminProductDetail } from "@/pages/products/types";
import { parseTaggedDescription } from "../lib/descriptionExtract";
import { hasText } from "../lib/format";
import CatalogueSectionHeading from "./CatalogueSectionHeading";
import { isConditionReportLabel } from "./CatalogueConditionReport";

interface CatalogueDescriptionProps {
  product: AdminProductDetail;
}

/**
 * 本文中の「※」「＊」で始まる行を注意事項として切り出す。
 * 本文と混ぜずに、下に小さく置くための分離（表示専用・保存はしない）。
 */
function splitAttentionLines(text: string): { body: string; notes: string[] } {
  const noteLines: string[] = [];
  const bodyLines: string[] = [];

  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (/^[※＊]|^注\s*[:：]/.test(trimmed)) {
      noteLines.push(trimmed);
      return;
    }
    bodyLines.push(line);
  });

  return { body: bodyLines.join("\n").trim(), notes: noteLines };
}

/**
 * 図録体裁の「商品説明」。
 * 本文は明朝で行間を広く取り、長い文章は5行で折りたたむ。
 * 注意事項（※書き）は本文と混ぜず、細い罫線で区切って小さい文字で下に置く。
 * 表示専用（保存データは変更しない）。
 */
export default function CatalogueDescription({
  product,
}: CatalogueDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(
    () => parseTaggedDescription(product.description ?? ""),
    [product.description]
  );

  // 状態・使用歴・付属品は「状態報告」側にまとめるため、本文の記載事項からは外す
  const otherFields = parsed.fields.filter(
    (field) => !isConditionReportLabel(field.label)
  );

  // 本文中の※書きは注意事項として分離する
  const split = useMemo(() => splitAttentionLines(parsed.lead), [parsed.lead]);

  const body = split.body;
  const hasBody = hasText(body);
  const needsToggle = body.trim().length > 180;
  const hasTags = parsed.hashtags.length > 0;

  // 本文の※書きと備考欄の両方を、注意事項としてまとめて下に出す
  const noteText = [...split.notes, product.notes ?? ""]
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .join("\n");
  const hasNotes = hasText(noteText);

  const hasAny = hasBody || otherFields.length > 0 || hasTags || hasNotes;

  return (
    <section>
      <CatalogueSectionHeading
        eyebrow="Description"
        title="商品説明"
        right={
          !hasAny ? (
            <span className="cat-mono text-[9px] tracking-[0.2em] text-[var(--cat-ink-soft)]">
              未入力
            </span>
          ) : undefined
        }
      />

      {hasAny ? (
        <div className="mt-4">
          {otherFields.length > 0 && (
            <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-2 border-b border-[var(--cat-rule-soft)] pb-4">
              {otherFields.map((field) => (
                <div
                  key={field.label}
                  className="flex min-w-0 items-baseline gap-2"
                >
                  <dt className="shrink-0 text-[10px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
                    {field.label}
                  </dt>
                  <dd className="min-w-0 break-words text-[12.5px] leading-[1.8] text-[var(--cat-ink)]">
                    {field.values.join(" / ")}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {hasBody && (
            <div>
              <p
                className={`whitespace-pre-line break-words text-[14px] leading-[2.05] tracking-[0.02em] text-[var(--cat-ink)] ${
                  needsToggle && !expanded ? "line-clamp-5" : ""
                }`}
              >
                {body.trim()}
              </p>
              {needsToggle && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  className="mt-2 inline-flex cursor-pointer items-center gap-1 border-b border-[var(--cat-rule)] pb-0.5 text-[10.5px] tracking-[0.14em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-ink)] hover:text-[var(--cat-ink)]"
                >
                  <i
                    className={`${
                      expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
                    } w-3 h-3 flex items-center justify-center text-[11px]`}
                    aria-hidden="true"
                  ></i>
                  {expanded ? "閉じる" : "全文を表示"}
                </button>
              )}
            </div>
          )}

          {hasTags && (
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {parsed.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="cat-mono inline-flex max-w-full items-center border border-[var(--cat-rule-soft)] px-2 py-0.5 text-[10.5px] leading-5 text-[var(--cat-ink-soft)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {hasNotes && (
            <div className="mt-6 border-t border-[var(--cat-rule-soft)] pt-3">
              <p className="flex flex-wrap items-baseline gap-x-2.5 text-[var(--cat-ink-soft)]">
                <span className="cat-mono text-[9px] uppercase leading-none tracking-[0.24em]">
                  Notes
                </span>
                <span className="cat-serif text-[11px] leading-none tracking-[0.12em]">
                  注意事項
                </span>
              </p>
              <p className="mt-2 whitespace-pre-line break-words text-[11.5px] leading-[1.95] text-[var(--cat-ink-soft)]">
                {noteText}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--cat-ink-soft)]">
          商品説明・備考はまだ入力されていません。「商品情報を編集」から追加できます。
        </p>
      )}
    </section>
  );
}
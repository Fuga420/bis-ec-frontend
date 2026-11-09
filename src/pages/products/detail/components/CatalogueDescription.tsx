import { useMemo, useState } from "react";
import type { AdminProductDetail } from "@/pages/products/types";
import { parseTaggedDescription } from "../lib/descriptionExtract";
import { hasText, normalizeDisplayNewlines } from "../lib/format";
import CatalogueSectionHeading from "./CatalogueSectionHeading";
import { isConditionReportLabel } from "./CatalogueConditionReport";

interface CatalogueDescriptionProps {
  product: AdminProductDetail;
  // 親セクション側で見出し（言語切り替え付き）を表示する場合は false にする。
  // 見出しの有無だけで、本文の内容・折りたたみの挙動は変わらない。
  showHeading?: boolean;
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
 * 商品詳細の「商品説明」。
 * 本文は13.5pxで行間を確保し、長い文章は5行で折りたたむ。
 * 注意事項（※書き）は本文と混ぜず、薄い罫線で区切って小さい文字で下に置く。
 * 表示専用（保存データは変更しない）。
 */
export default function CatalogueDescription({
  product,
  showHeading = true,
}: CatalogueDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(
    () =>
      parseTaggedDescription(
        normalizeDisplayNewlines(product.description ?? "")
      ),
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
  // 文字数だけでなく行数でも判定する（改行の多い説明が初期表示で長くなりすぎないように）
  const needsToggle =
    body.trim().length > 180 || body.trim().split("\n").length > 6;
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
      {showHeading && (
        <CatalogueSectionHeading
          title="商品説明"
          right={
            !hasAny ? (
              <span className="text-[11px] text-foreground-400">未入力</span>
            ) : undefined
          }
        />
      )}

      {hasAny ? (
        <div className={showHeading ? "mt-2" : ""}>
          {otherFields.length > 0 && (
            <dl className="mb-3 flex flex-wrap gap-x-8 gap-y-1.5 border-b border-background-100 pb-3">
              {otherFields.map((field) => (
                <div
                  key={field.label}
                  className="flex min-w-0 items-baseline gap-2"
                >
                  <dt className="shrink-0 text-[11px] text-foreground-500">
                    {field.label}
                  </dt>
                  <dd className="min-w-0 break-words text-[13px] leading-6 text-foreground-800">
                    {field.values.join(" / ")}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {hasBody && (
            <div>
              <p
                className={`whitespace-pre-line break-words text-[13.5px] leading-[1.9] text-foreground-800 ${
                  needsToggle && !expanded ? "line-clamp-6" : ""
                }`}
              >
                {body.trim()}
              </p>
              {needsToggle && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  aria-expanded={expanded}
                  className="mt-1.5 inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-[12px] font-medium text-primary-700 transition-colors hover:text-primary-800"
                >
                  <i
                    className={`${
                      expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"
                    } w-3.5 h-3.5 flex items-center justify-center`}
                    aria-hidden="true"
                  ></i>
                  {expanded ? "閉じる" : "全文を表示"}
                </button>
              )}
            </div>
          )}

          {hasTags && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {parsed.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full items-center rounded-md bg-background-100 px-2 py-0.5 text-[11px] leading-5 text-foreground-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {hasNotes && (
            <div className="mt-4 border-t border-background-100 pt-3">
              <p className="text-[11px] font-medium text-foreground-500">
                注意事項
              </p>
              <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-[1.9] text-foreground-600">
                {noteText}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2.5 text-[12px] leading-relaxed text-foreground-500">
          商品説明・備考はまだ入力されていません。「商品情報を編集」から追加できます。
        </p>
      )}
    </section>
  );
}
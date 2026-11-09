import { useEffect, useRef } from "react";
import type { AdminProduct } from "../types";
import {
  getInlineTitleField,
  type InlineEditDraft,
} from "../lib/inlineEdit";

interface ProductInlineEditorProps {
  product: AdminProduct;
  draft: InlineEditDraft;
  saving: boolean;
  error?: string;
  onChange: (patch: Partial<InlineEditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

// 一覧行の直下に展開するインライン編集UI（下書きの「一覧に表示するタイトル」「販売予定価格」のみ）。
// タイトルは「いま一覧に表示しているタイトル」そのものを編集し、
// スニーカーの英語タイトル行は translated_title、それ以外は product_name として保存する
// （保存先の判定は lib/inlineEdit.ts に集約）。
//
// 見た目は商品一覧と同じ「白＋薄いグレーの罫線＋深緑」に揃え、
// 行とフォームの間はヘアライン1本だけでつなぐ（強い背景色・影は使わない）。
export default function ProductInlineEditor({
  product,
  draft,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: ProductInlineEditorProps) {
  const titleField = getInlineTitleField(product);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // IDは行ごとに一意（ラベルと入力欄の関連付け、エラー説明の参照に使う）
  const titleId = `inline-edit-title-${product.product_id}`;
  const priceId = `inline-edit-price-${product.product_id}`;
  const errorId = `inline-edit-error-${product.product_id}`;

  // 編集開始時（別の商品に切り替えたときも）商品名入力欄へフォーカスを移す。
  // 入力値そのものは変更しない。
  useEffect(() => {
    const el = nameInputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // 一部ブラウザで未対応でもフォーカスだけは維持する
    }
  }, [product.product_id]);

  const fieldBase =
    "h-11 w-full rounded-lg border border-background-300 bg-white px-3 text-[14px] text-foreground-950 placeholder:text-foreground-400 outline-none transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:border-background-200 disabled:bg-background-100 disabled:text-foreground-400";

  return (
    <div className="border-t border-background-200 bg-white px-4 py-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        noValidate
      >
        {/* 見出し＋編集対象の商品ID（行にも商品IDは出ているので控えめに添えるだけ） */}
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4 className="text-[14px] font-semibold leading-[1.4] text-foreground-800">
            商品情報を編集
          </h4>
          <span className="admin-numeric text-[12px] leading-none text-foreground-400">
            {product.product_id}
          </span>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          {/* 商品名（メイン入力欄・PCでは余剰幅をすべて受け取る） */}
          <div className="min-w-0 flex-1">
            <label
              htmlFor={titleId}
              className="block text-[12px] font-medium leading-[1.5] text-foreground-500"
            >
              商品名
            </label>
            <input
              ref={nameInputRef}
              id={titleId}
              type="text"
              className={`mt-1 ${fieldBase}`}
              value={draft.title}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => onChange({ title: e.target.value })}
            />
            {/* スニーカーの英語タイトル行だけ、保存先が本票の商品名と異なることを示す（既存の説明を維持） */}
            {titleField === "translated_title" && (
              <p className="mt-1 text-[12px] leading-[1.5] text-foreground-400">
                英語タイトル（翻訳タイトル）として保存します。本票の商品名は変更しません。
              </p>
            )}
          </div>

          {/* 販売予定価格（PCでは220〜260px程度の固定幅） */}
          <div className="w-full lg:w-[240px] lg:shrink-0">
            <label
              htmlFor={priceId}
              className="block text-[12px] font-medium leading-[1.5] text-foreground-500"
            >
              販売予定価格（円）
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-foreground-400">
                ¥
              </span>
              <input
                id={priceId}
                type="text"
                inputMode="numeric"
                className={`${fieldBase} pl-7 tabular-nums`}
                value={draft.price}
                disabled={saving}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) =>
                  onChange({ price: e.target.value.replace(/[^0-9]/g, "") })
                }
              />
            </div>
          </div>
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-2.5 flex items-start gap-1.5 text-[11.5px] font-medium leading-relaxed text-red-600"
          >
            <i className="ri-error-warning-line mt-0.5 h-3.5 w-3.5 shrink-0 flex items-center justify-center"></i>
            <span className="min-w-0 flex-1">{error}</span>
          </p>
        )}

        {/* 保存・キャンセルは右側にまとめる（高さ36〜40px・角丸8px） */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 text-[13px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line h-4 w-4 animate-spin flex items-center justify-center"></i>
                保存中...
              </>
            ) : (
              "保存"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
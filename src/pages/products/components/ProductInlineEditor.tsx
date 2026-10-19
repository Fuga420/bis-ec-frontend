import { inputClass } from "@/pages/register/components/FormField";
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

// 一覧行のインライン編集UI（下書きの「一覧に表示するタイトル」「販売予定価格」のみ）。
// タイトルは「いま一覧に表示しているタイトル」そのものを編集し、
// スニーカーの英語タイトル行は translated_title、それ以外は product_name として保存する
// （保存先の判定は lib/inlineEdit.ts に集約）。
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

  return (
    <div className="border-b border-primary-200 bg-primary-50/40 px-4 py-3 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-medium text-foreground-500">
            一覧に表示するタイトル
          </label>
          <input
            type="text"
            className={`${inputClass} mt-1`}
            value={draft.title}
            disabled={saving}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <p className="mt-1 flex items-center gap-1 text-[11px] text-foreground-400">
            <i className="ri-information-line w-3 h-3 flex items-center justify-center"></i>
            {titleField === "translated_title"
              ? "英語タイトル（翻訳タイトル）として保存します。本票の商品名は変更しません。"
              : "本票の商品名として保存します。"}
          </p>
        </div>

        <div className="w-full lg:w-[180px] lg:shrink-0">
          <label className="text-xs font-medium text-foreground-500">
            販売予定価格 (円)
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
              ¥
            </span>
            <input
              type="text"
              inputMode="numeric"
              className={`${inputClass} pl-7`}
              value={draft.price}
              disabled={saving}
              onChange={(e) =>
                onChange({ price: e.target.value.replace(/[^0-9]/g, "") })
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-white px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                保存中...
              </>
            ) : (
              <>
                <i className="ri-save-line w-4 h-4 flex items-center justify-center"></i>
                保存
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <i className="ri-error-warning-line mt-0.5 w-3.5 h-3.5 flex items-center justify-center shrink-0"></i>
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
    </div>
  );
}
import FormField, { inputClass } from "@/pages/register/components/FormField";
import {
  resolveConditionId,
  type AiProductCandidate,
} from "@/pages/register/lib/aiProduct";
import {
  categories,
  conditions,
  type CategoryId,
} from "@/mocks/productForm";

interface AiCandidateFormProps {
  candidate: AiProductCandidate;
  onChange: (patch: Partial<AiProductCandidate>) => void;
  onApply: () => void;
  onDiscard: () => void;
  // 確定保存（confirm_ai_product_draft）。priceInput はスタッフ入力の価格。
  onConfirm: () => void;
  priceInput: string;
  // 価格はAIドラフトの candidate.price を初期値にした編集可能な入力欄として扱う。
  onPriceChange: (value: string) => void;
  confirming: boolean;
  confirmError: string;
  confirmDisabled?: boolean;
}

export default function AiCandidateForm({
  candidate,
  onChange,
  onApply,
  onDiscard,
  onConfirm,
  priceInput,
  onPriceChange,
  confirming,
  confirmError,
  confirmDisabled = false,
}: AiCandidateFormProps) {
  const categoryValue = categories.some((c) => c.id === candidate.category)
    ? candidate.category
    : categories.some((c) => c.label === candidate.category)
      ? (categories.find((c) => c.label === candidate.category)?.id ?? "")
      : candidate.category;
  const categoryOptions = categories.slice();
  if (categoryValue && !categoryOptions.some((c) => c.id === categoryValue)) {
    categoryOptions.push({
      id: categoryValue as CategoryId,
      label: candidate.category,
      icon: "ri-more-line",
    });
  }

  // 状態は必ず日本語6種類のいずれかのIDへ解決する（「S」などのランクやラベルでも揃える）。
  const conditionValue = resolveConditionId(candidate.condition);

  const hashtagText = candidate.hashtags.join(" ");

  return (
    <div className="rounded-lg border border-accent-300 bg-accent-50/60 p-3 md:p-4">
      <div className="flex items-center gap-2">
        <i className="ri-sparkling-line w-4 h-4 flex items-center justify-center text-accent-600"></i>
        <h3 className="text-sm font-semibold text-foreground-950">
          AI生成された候補（確認・編集できます）
        </h3>
      </div>
      <p className="mt-1 text-[11px] text-foreground-500">
        この内容はまだ保存・公開されていません。編集してから登録フォームへ反映してください。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="日本語タイトル">
          <input
            className={inputClass}
            type="text"
            value={candidate.title_ja}
            onChange={(e) => onChange({ title_ja: e.target.value })}
          />
        </FormField>
        <FormField label="英語タイトル">
          <input
            className={inputClass}
            type="text"
            value={candidate.title_en}
            onChange={(e) => onChange({ title_en: e.target.value })}
          />
        </FormField>

        <FormField label="カテゴリ">
          <select
            className={inputClass}
            value={categoryValue}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="">未設定</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="ブランド">
          <input
            className={inputClass}
            type="text"
            value={candidate.brand}
            onChange={(e) => onChange({ brand: e.target.value })}
          />
        </FormField>

        <FormField label="状態">
          <select
            className={inputClass}
            value={conditionValue}
            onChange={(e) => onChange({ condition: e.target.value })}
          >
            <option value="">未設定</option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="SKU">
            <input
              className={inputClass}
              type="text"
              value={candidate.sku}
              onChange={(e) => onChange({ sku: e.target.value })}
            />
          </FormField>
          <FormField label="サイズ">
            <input
              className={inputClass}
              type="text"
              value={candidate.size}
              onChange={(e) => onChange({ size: e.target.value })}
            />
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField label="日本語の説明文">
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={candidate.description_ja}
              onChange={(e) => onChange({ description_ja: e.target.value })}
            />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="英語の説明文">
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={candidate.description_en}
              onChange={(e) => onChange({ description_en: e.target.value })}
            />
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField
            label="ハッシュタグ"
            hint="スペース区切りで入力（例：#Nike #AirForce1）"
          >
            <input
              className={inputClass}
              type="text"
              value={hashtagText}
              onChange={(e) =>
                onChange({
                  hashtags: e.target.value.split(/\s+/).filter(Boolean),
                })
              }
            />
          </FormField>
        </div>
      </div>

      {/* 販売予定価格：AIドラフトの candidate.price を「編集可能な初期値」として表示する。
          （商品本票の販売予定価格ではなく、生成レスポンスの candidate.price を参照する。）
          スタッフはここで修正でき、確定保存（confirm_ai_product_draft）にはこの入力値を用いる。
          candidate.price が空のときも欄は表示し、空のまま手入力できる。 */}
      <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50/70 px-3 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-52">
            <FormField label="販売予定価格 (円)">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
                  ¥
                </span>
                <input
                  className={`${inputClass} pl-7`}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={priceInput}
                  onChange={(e) =>
                    onPriceChange(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </div>
            </FormField>
          </div>
          {candidate.price != null && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
              <i className="ri-price-tag-3-line w-3.5 h-3.5 flex items-center justify-center"></i>
              AI概算 ¥{candidate.price.toLocaleString()}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-foreground-500">
          {candidate.price != null
            ? "AI概算を初期値として表示しています。必要に応じて修正してから確定してください。"
            : "価格候補は提供されていません。必要に応じて入力してから確定してください（0や架空の価格で補いません）。"}
        </p>
      </div>

      {confirmError && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span className="min-w-0 flex-1 break-words">{confirmError}</span>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming || confirmDisabled}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirming ? (
            <>
              <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
              確定保存中...
            </>
          ) : (
            <>
              <i className="ri-check-double-line w-4 h-4 flex items-center justify-center"></i>
              この内容で確定保存
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={confirming || confirmDisabled}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-arrow-down-line w-4 h-4 flex items-center justify-center"></i>
          登録フォームに反映
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={confirming || confirmDisabled}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="ri-close-line w-4 h-4 flex items-center justify-center"></i>
          候補を破棄
        </button>
      </div>
    </div>
  );
}
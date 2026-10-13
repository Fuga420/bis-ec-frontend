import FormField, { inputClass } from "./FormField";
import { sneakerSizes, boxOptions, sneakerAccessories } from "@/mocks/productForm";

export interface SneakerValues {
  sku: string;
  size: string;
  color: string;
  box: string;
  year: string;
}

interface SneakerFieldsProps {
  values: SneakerValues;
  accessories: string[];
  sizeError?: string;
  onChange: (patch: Partial<SneakerValues>) => void;
  onAccessoriesChange: (accessories: string[]) => void;
}

export default function SneakerFields({
  values,
  accessories,
  sizeError,
  onChange,
  onAccessoriesChange,
}: SneakerFieldsProps) {
  const toggleAccessory = (item: string) => {
    const next = accessories.includes(item)
      ? accessories.filter((a) => a !== item)
      : [...accessories, item];
    onAccessoriesChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="SKU / 型番">
          <input
            className={inputClass}
            type="text"
            placeholder="例：DD1391-100"
            value={values.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
          />
        </FormField>

        <FormField label="サイズ (cm)" required error={sizeError}>
          <select
            className={inputClass}
            value={values.size}
            onChange={(e) => onChange({ size: e.target.value })}
          >
            <option value="">選択してください</option>
            {sneakerSizes.map((s) => (
              <option key={s} value={s}>
                {s} cm
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="カラー / カラーウェイ">
          <input
            className={inputClass}
            type="text"
            placeholder="例：ホワイト / ブラック"
            value={values.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </FormField>

        <FormField label="箱の有無">
          <select
            className={inputClass}
            value={values.box}
            onChange={(e) => onChange({ box: e.target.value })}
          >
            <option value="">選択してください</option>
            {boxOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="発売年">
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            placeholder="例：2021"
            maxLength={4}
            value={values.year}
            onChange={(e) => onChange({ year: e.target.value })}
          />
        </FormField>

        <FormField label="付属品">
          <div className="flex flex-wrap gap-1.5">
            {sneakerAccessories.map((item) => {
              const active = accessories.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleAccessory(item)}
                  className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-background-300 bg-background-50 text-foreground-600 hover:border-primary-300"
                  }`}
                >
                  {active && (
                    <i className="ri-check-line mr-0.5 text-primary-600"></i>
                  )}
                  {item}
                </button>
              );
            })}
          </div>
        </FormField>
      </div>
    </div>
  );
}
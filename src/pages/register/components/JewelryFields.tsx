import FormField, { inputClass } from "./FormField";
import {
  jewelryTypes,
  jewelryMaterials,
  jewelryStones,
  jewelryShapes,
  diamondColors,
  diamondClarity,
  diamondCut,
  certificateOptions,
} from "@/mocks/productForm";

export interface JewelryValues {
  type: string;
  material: string;
  carat: string;
  shape: string;
  color: string;
  clarity: string;
  cut: string;
  stone: string;
  size: string;
  weight: string;
  certPresence: string;
  certNumber: string;
}

interface JewelryFieldsProps {
  values: JewelryValues;
  typeError?: string;
  materialError?: string;
  onChange: (patch: Partial<JewelryValues>) => void;
}

function SubHeading({ text }: { text: string }) {
  return (
    <p className="text-xs font-semibold text-foreground-600">
      {text}
    </p>
  );
}

export default function JewelryFields({
  values,
  typeError,
  materialError,
  onChange,
}: JewelryFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="種類" required error={typeError}>
          <select
            className={inputClass}
            value={values.type}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            <option value="">選択してください</option>
            {jewelryTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="素材" required error={materialError}>
          <select
            className={inputClass}
            value={values.material}
            onChange={(e) => onChange({ material: e.target.value })}
          >
            <option value="">選択してください</option>
            {jewelryMaterials.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <SubHeading text="ダイヤモンド 4C・石情報" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="カラット (ct)">
          <input
            className={inputClass}
            type="text"
            inputMode="decimal"
            placeholder="例：0.50"
            value={values.carat}
            onChange={(e) => onChange({ carat: e.target.value })}
          />
        </FormField>

        <FormField label="シェイプ">
          <select
            className={inputClass}
            value={values.shape}
            onChange={(e) => onChange({ shape: e.target.value })}
          >
            <option value="">選択してください</option>
            {jewelryShapes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="カラー (グレード)">
          <select
            className={inputClass}
            value={values.color}
            onChange={(e) => onChange({ color: e.target.value })}
          >
            <option value="">選択してください</option>
            {diamondColors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="クラリティ">
          <select
            className={inputClass}
            value={values.clarity}
            onChange={(e) => onChange({ clarity: e.target.value })}
          >
            <option value="">選択してください</option>
            {diamondClarity.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="カット">
          <select
            className={inputClass}
            value={values.cut}
            onChange={(e) => onChange({ cut: e.target.value })}
          >
            <option value="">選択してください</option>
            {diamondCut.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="メインストーン">
          <select
            className={inputClass}
            value={values.stone}
            onChange={(e) => onChange({ stone: e.target.value })}
          >
            <option value="">選択してください</option>
            {jewelryStones.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="サイズ">
          <input
            className={inputClass}
            type="text"
            placeholder="例：11号 / 42cm"
            value={values.size}
            onChange={(e) => onChange({ size: e.target.value })}
          />
        </FormField>

        <FormField label="重量 (g)">
          <input
            className={inputClass}
            type="text"
            inputMode="decimal"
            placeholder="例：3.5"
            value={values.weight}
            onChange={(e) => onChange({ weight: e.target.value })}
          />
        </FormField>
      </div>

      <SubHeading text="鑑定書" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="鑑定書の有無">
          <select
            className={inputClass}
            value={values.certPresence}
            onChange={(e) => onChange({ certPresence: e.target.value })}
          >
            <option value="">選択してください</option>
            {certificateOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="鑑定書番号">
          <input
            className={inputClass}
            type="text"
            placeholder="例：GIA-1234567890"
            value={values.certNumber}
            onChange={(e) => onChange({ certNumber: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}
import FormField, { inputClass } from "./FormField";
import {
  pokemonCardLanguages,
  pokemonCardRarities,
  pokemonCardGraders,
  pokemonCardConditions,
} from "@/mocks/productForm";

export interface PokemonCardValues {
  card_name: string;
  set_name: string;
  card_number: string;
  rarity: string;
  language: string;
  // graded: グレード付き鑑定済み / authenticated: 真贋鑑定のみ / ungraded: 未鑑定
  grading_status: "graded" | "authenticated" | "ungraded";
  grader: string;
  grade: string;
  certification_number: string;
  card_condition: string;
}

interface PokemonCardFieldsProps {
  values: PokemonCardValues;
  nameError?: string;
  languageError?: string;
  graderError?: string;
  gradeError?: string;
  certificationError?: string;
  conditionError?: string;
  onChange: (patch: Partial<PokemonCardValues>) => void;
}

type GradingStatus = PokemonCardValues["grading_status"];

const GRADING_STATUS_OPTIONS: { value: GradingStatus; label: string }[] = [
  { value: "ungraded", label: "未鑑定" },
  { value: "graded", label: "鑑定済み" },
  { value: "authenticated", label: "真贋鑑定のみ" },
];

export default function PokemonCardFields({
  values,
  nameError,
  languageError,
  graderError,
  gradeError,
  certificationError,
  conditionError,
  onChange,
}: PokemonCardFieldsProps) {
  const isGraded = values.grading_status === "graded";
  const isAuthenticated = values.grading_status === "authenticated";
  const isCertified = isGraded || isAuthenticated;

  const handleGradingStatusChange = (status: GradingStatus) => {
    if (status === "ungraded") {
      onChange({
        grading_status: "ungraded",
        grader: "",
        grade: "",
        certification_number: "",
      });
      return;
    }
    // 鑑定済み / 真贋鑑定のみ ではカード状態（A/B/C）を使わない。
    onChange({ grading_status: status, card_condition: "" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="カード名" required error={nameError}>
          <input
            className={inputClass}
            type="text"
            placeholder="例：Pikachu"
            value={values.card_name}
            onChange={(e) => onChange({ card_name: e.target.value })}
          />
        </FormField>

        <FormField label="セット名">
          <input
            className={inputClass}
            type="text"
            placeholder="例：Scarlet & Violet 151"
            value={values.set_name}
            onChange={(e) => onChange({ set_name: e.target.value })}
          />
        </FormField>

        <FormField label="カード番号">
          <input
            className={inputClass}
            type="text"
            placeholder="例：025/165"
            value={values.card_number}
            onChange={(e) => onChange({ card_number: e.target.value })}
          />
        </FormField>

        <FormField label="レアリティ">
          <select
            className={inputClass}
            value={values.rarity}
            onChange={(e) => onChange({ rarity: e.target.value })}
          >
            <option value="">選択してください</option>
            {pokemonCardRarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="言語" required error={languageError}>
          <select
            className={inputClass}
            value={values.language}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            <option value="">選択してください</option>
            {pokemonCardLanguages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="鑑定状態" required>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-background-100 p-1">
          {GRADING_STATUS_OPTIONS.map((option) => {
            const selected = values.grading_status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleGradingStatusChange(option.value)}
                aria-pressed={selected}
                className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-white text-foreground-950"
                    : "text-foreground-600 hover:text-foreground-900"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </FormField>

      {isCertified ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="鑑定会社" required error={graderError}>
            <select
              className={inputClass}
              value={values.grader}
              onChange={(e) => onChange({ grader: e.target.value })}
            >
              <option value="">選択してください</option>
              {pokemonCardGraders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="グレード"
            required={isGraded}
            error={gradeError}
            hint={isAuthenticated ? "真贋鑑定のみの場合は任意です" : undefined}
          >
            <input
              className={inputClass}
              type="text"
              placeholder="例：10"
              value={values.grade}
              onChange={(e) => onChange({ grade: e.target.value })}
            />
          </FormField>

          <FormField
            label={isAuthenticated ? "認証番号" : "鑑定番号"}
            required={isAuthenticated}
            error={certificationError}
          >
            <input
              className={inputClass}
              type="text"
              placeholder="例：0009876543"
              value={values.certification_number}
              onChange={(e) =>
                onChange({ certification_number: e.target.value })
              }
            />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="カード状態"
            required
            error={conditionError}
            hint="AはAI生成直後の初期値です（現物確認前）。現物を確認して必要に応じてB/Cへ修正してください。"
          >
            <select
              className={inputClass}
              value={values.card_condition}
              onChange={(e) => onChange({ card_condition: e.target.value })}
            >
              <option value="">選択してください</option>
              {pokemonCardConditions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      )}
    </div>
  );
}
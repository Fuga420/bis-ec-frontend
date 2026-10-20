import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

interface FormFieldProps {
  label: string;
  badge?: string;
  badgeColor?: "primary" | "secondary" | "accent";
  required?: boolean;
  hint?: string;
  hintAlign?: "left" | "right";
  error?: string;
  children: ReactNode;
}

export default function FormField({
  label,
  badge,
  badgeColor = "secondary",
  required,
  hint,
  hintAlign = "left",
  error,
  children,
}: FormFieldProps) {
  const errorId = useId();

  const badgeClasses = {
    primary: "border border-primary-200 bg-primary-50/60 text-primary-700",
    secondary:
      "border border-background-200 bg-background-50 text-foreground-500",
    accent: "border border-accent-200 bg-accent-50/60 text-accent-700",
  };

  // エラー時に aria-invalid / aria-describedby を入力要素へ渡す。
  // 見た目の枠線は .register-field-error の CSS で該当入力欄へ反映する。
  const enhancedChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<Record<string, unknown>>;
    const existingDescribedBy = el.props["aria-describedby"] as
      | string
      | undefined;
    return cloneElement(el, {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? errorId : existingDescribedBy,
    });
  });

  return (
    <div
      className={`flex flex-col gap-1.5 ${error ? "register-field-error" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-sm font-medium text-foreground-700">{label}</span>
        {required && (
          <span
            className="text-[13px] font-semibold leading-none text-red-500"
            aria-label="必須"
            title="必須"
          >
            *
          </span>
        )}
        {badge && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClasses[badgeColor]}`}
          >
            {badge}
          </span>
        )}
      </div>
      {enhancedChildren}
      {hint && !error && (
        <p
          className={`text-xs text-foreground-400 ${
            hintAlign === "right" ? "text-right" : ""
          }`}
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1 text-xs leading-relaxed text-red-600"
        >
          <i className="ri-error-warning-line mt-0.5 w-4 h-4 flex items-center justify-center"></i>
          <span className="min-w-0 flex-1">{error}</span>
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-background-300 bg-white px-3 py-2.5 text-sm text-foreground-950 placeholder:text-foreground-400 outline-none transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:border-background-200 disabled:bg-background-100 disabled:text-foreground-400";
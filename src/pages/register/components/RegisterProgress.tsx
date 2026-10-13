interface RegisterProgressProps {
  steps: string[];
  currentIndex: number;
}

export default function RegisterProgress({
  steps,
  currentIndex,
}: RegisterProgressProps) {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-3 md:p-4">
      <div className="flex items-center gap-2">
        <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-600"></i>
        <span className="text-xs font-semibold text-foreground-700">
          処理中...
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {steps.map((label, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={label} className="flex items-center gap-2">
              {isDone ? (
                <i className="ri-checkbox-circle-fill w-4 h-4 flex items-center justify-center text-primary-500"></i>
              ) : isCurrent ? (
                <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-500"></i>
              ) : (
                <i className="ri-checkbox-blank-circle-line w-4 h-4 flex items-center justify-center text-foreground-300"></i>
              )}
              <span
                className={`text-xs ${
                  isDone
                    ? "text-foreground-500"
                    : isCurrent
                      ? "font-medium text-foreground-900"
                      : "text-foreground-400"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
import type { ReactNode } from "react";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { RECORD_STATUS_LABELS } from "@/pages/products/types";

type SaveMessage = { type: "success" | "error"; text: string } | null;

interface SegmentOption {
  value: string;
  label: string;
}

interface SalesManagementPanelProps {
  publish: {
    statusLabel: string;
    currentStatus: string;
    selectedStatus: string;
    saving: boolean;
    message: SaveMessage;
    onSelect: (value: string) => void;
    onSave: () => void;
  };
  inventory: {
    inventoryLabel: string;
    currentStatus: string;
    selectedStatus: string;
    saving: boolean;
    message: SaveMessage;
    onSelect: (value: string) => void;
    onSave: () => void;
  };
  record: {
    recordStatus: string;
    saving: boolean;
    message: { type: "success" | "error" | "warning"; text: string } | null;
    onSelectArchived: () => void;
    onSelectActive: () => void;
    onRequestDelete: () => void;
  };
}

const PUBLISH_STATUS_OPTIONS: SegmentOption[] = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "hidden", label: "非公開" },
];

const INVENTORY_STATUS_OPTIONS: SegmentOption[] = [
  { value: "in_stock", label: "在庫あり" },
  { value: "reserved", label: "取り置き / 商談中" },
  { value: "sold", label: "売却済み" },
];

const RECORD_STATUS_OPTIONS: SegmentOption[] = [
  { value: "active", label: RECORD_STATUS_LABELS.active },
  { value: "archived", label: RECORD_STATUS_LABELS.archived },
];

const SEGMENT_WRAP = "inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-background-100 p-0.5";
const SEGMENT_BUTTON =
  "cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors";
const SEGMENT_ACTIVE = "bg-white text-foreground-950 shadow-sm";
const SEGMENT_IDLE = "text-foreground-600 hover:text-foreground-900";
const ROW = "px-4 py-3 md:px-5";
const LABEL_CELL = "w-full shrink-0 sm:w-[92px]";

/** 1行分の設定行（左ラベル / セグメント / 保存ボタン / 状態メッセージ） */
function SettingRow({
  label,
  hint,
  children,
  message,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  message?: ReactNode;
}) {
  return (
    <div className={ROW}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className={LABEL_CELL}>
          <span className="text-[13px] font-semibold text-foreground-900">
            {label}
          </span>
          {hint && (
            <p className="mt-0.5 text-[11px] leading-tight text-foreground-400">
              {hint}
            </p>
          )}
        </div>
        {children}
      </div>
      {message}
    </div>
  );
}

function SegmentGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={SEGMENT_WRAP}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={disabled}
            className={`${SEGMENT_BUTTON} ${active ? SEGMENT_ACTIVE : SEGMENT_IDLE} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SaveButton({
  saving,
  disabled,
  label,
  onClick,
}: {
  saving: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-semibold text-background-50 transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? (
        <>
          <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
          保存中...
        </>
      ) : (
        <>
          <i className="ri-save-line w-3.5 h-3.5 flex items-center justify-center"></i>
          {label}
        </>
      )}
    </button>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "primary" | "neutral" }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11px] font-medium leading-none ${
        tone === "primary"
          ? "bg-primary-100 text-primary-700"
          : "bg-background-100 text-foreground-600"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * 販売管理タブ: 公開状態 / 在庫状態 / レコード状態を1つのカードにまとめた設定ブロック。
 * 表示と入力の受け渡しのみを担当し、保存処理は呼び出し元（商品詳細ページ）が持つ。
 */
export default function SalesManagementPanel({
  publish,
  inventory,
  record,
}: SalesManagementPanelProps) {
  const publishDirty = publish.selectedStatus !== publish.currentStatus;
  const inventoryDirty = inventory.selectedStatus !== inventory.currentStatus;
  const recordLabel =
    RECORD_STATUS_LABELS[record.recordStatus] ?? record.recordStatus ?? "—";

  return (
    <div className="rounded-[10px] border border-background-200 bg-white">
      {/* 見出し + 現在の状態バッジ */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-background-100 px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[15px] font-semibold text-foreground-950">
            販売管理
          </h2>
          <span className="text-[11px] text-foreground-400">
            変更は保存ボタンで反映されます
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip
            label={`公開: ${publish.statusLabel}`}
            tone={publish.currentStatus === "published" ? "primary" : "neutral"}
          />
          <StatusChip label={`在庫: ${inventory.inventoryLabel}`} tone="neutral" />
          <StatusChip label={`レコード: ${recordLabel}`} tone="neutral" />
        </div>
      </div>

      <div className="divide-y divide-background-100">
        {/* 公開状態 */}
        <SettingRow
          label="公開状態"
          message={
            publish.message ? (
              <SaveStatusMessage
                tone={publish.message.type}
                text={publish.message.text}
                className="mt-2"
              />
            ) : null
          }
        >
          <SegmentGroup
            options={PUBLISH_STATUS_OPTIONS}
            value={publish.selectedStatus}
            onChange={publish.onSelect}
          />
          <div className="flex items-center gap-2">
            <SaveButton
              saving={publish.saving}
              disabled={!publishDirty}
              label="公開状態を保存"
              onClick={publish.onSave}
            />
            {!publish.saving && publishDirty && (
              <span className="whitespace-nowrap text-[11px] font-medium text-foreground-400">
                未保存
              </span>
            )}
          </div>
        </SettingRow>

        {/* 在庫状態 */}
        <SettingRow
          label="在庫状態"
          message={
            inventory.message ? (
              <SaveStatusMessage
                tone={inventory.message.type}
                text={inventory.message.text}
                className="mt-2"
              />
            ) : null
          }
        >
          <SegmentGroup
            options={INVENTORY_STATUS_OPTIONS}
            value={inventory.selectedStatus}
            onChange={inventory.onSelect}
          />
          <div className="flex items-center gap-2">
            <SaveButton
              saving={inventory.saving}
              disabled={!inventoryDirty}
              label="在庫状態を保存"
              onClick={inventory.onSave}
            />
            {!inventory.saving && inventoryDirty && (
              <span className="whitespace-nowrap text-[11px] font-medium text-foreground-400">
                未保存
              </span>
            )}
          </div>
        </SettingRow>

        {/* レコード状態（通常管理 / アーカイブ済み + 完全削除の導線） */}
        <SettingRow
          label="レコード状態"
          message={
            <>
              {record.saving && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-400">
                  <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                  処理中...
                </p>
              )}
              {record.message && (
                <SaveStatusMessage
                  tone={record.message.type}
                  text={record.message.text}
                  className="mt-2"
                />
              )}
            </>
          }
        >
          <SegmentGroup
            options={RECORD_STATUS_OPTIONS}
            value={record.recordStatus}
            disabled={record.saving}
            onChange={(value) => {
              if (value === record.recordStatus) return;
              if (value === "archived") {
                record.onSelectArchived();
              } else {
                record.onSelectActive();
              }
            }}
          />
          {record.recordStatus !== "active" && (
            <button
              type="button"
              onClick={record.onRequestDelete}
              disabled={record.saving}
              className="inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-background-200 px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-delete-bin-6-line w-3.5 h-3.5 flex items-center justify-center"></i>
              完全削除
            </button>
          )}
        </SettingRow>
      </div>
    </div>
  );
}
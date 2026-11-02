import type { ReactNode } from "react";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { RECORD_STATUS_LABELS } from "@/pages/products/types";
import SectionHeading from "./SectionHeading";

type SaveMessage = { type: "success" | "error"; text: string } | null;

interface SegmentOption {
  value: string;
  label: string;
}

/** 商品がどこまで進んだか（販売管理の先頭に出すステップ表示用） */
export interface SalesWorkflow {
  // 取込済み（商品レコードが存在する）
  imported: boolean;
  // AIによる下書き生成（価格案など）がある
  aiGenerated: boolean;
  // スタッフが内容・価格を確認済み
  reviewed: boolean;
  // 公開中
  published: boolean;
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
  workflow: SalesWorkflow;
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

const SEGMENT_WRAP =
  "inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-background-100 p-0.5";
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

// バッジの色は「ドメイン」で固定する（index.css の .st-*）。
// 公開状態＝緑 / 在庫＝青グレー / レコード＝グレー。
const CHIP_TONES = {
  publish: "st-publish",
  "publish-off": "st-publish-off",
  inventory: "st-inventory",
  link: "st-link",
} as const;

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof CHIP_TONES;
}) {
  return <span className={`st-badge ${CHIP_TONES[tone]}`}>{label}</span>;
}

const WORKFLOW_STEPS = [
  { key: "imported", label: "取込", icon: "ri-inbox-archive-line" },
  { key: "aiGenerated", label: "AI生成", icon: "ri-sparkling-line" },
  { key: "reviewed", label: "確認", icon: "ri-checkbox-circle-line" },
  { key: "published", label: "公開", icon: "ri-global-line" },
] as const;

/**
 * 取込 → AI生成 → 確認 → 公開 のステップ表示。
 * ボタンの羅列ではなく「今どこにいるか」が分かるようにする（表示専用）。
 */
function WorkflowSteps({ workflow }: { workflow: SalesWorkflow }) {
  const doneList = WORKFLOW_STEPS.map((step, index) => {
    if (step.key === "imported") return workflow.imported;
    if (step.key === "aiGenerated") return workflow.aiGenerated;
    if (step.key === "reviewed") return workflow.reviewed;
    return workflow.published;
  });
  const currentIndex = doneList.findIndex((done) => !done);

  return (
    <div className="border-b border-background-100 bg-background-50 px-4 py-2.5 md:px-5">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        {WORKFLOW_STEPS.map((step, index) => {
          const done = doneList[index];
          const current = index === currentIndex;
          return (
            <li key={step.key} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none ${
                  done
                    ? "bg-primary-500 text-background-50"
                    : current
                      ? "bg-white text-primary-700 ring-1 ring-primary-400"
                      : "bg-background-200 text-foreground-400"
                }`}
                aria-hidden="true"
              >
                {done ? (
                  <i className="ri-check-line text-[11px] leading-none"></i>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] ${
                  current
                    ? "font-semibold text-foreground-950"
                    : done
                      ? "font-medium text-foreground-700"
                      : "text-foreground-400"
                }`}
              >
                {step.label}
                {current && (
                  <span className="rounded bg-primary-50 px-1 py-0.5 text-[9px] font-bold text-primary-700">
                    現在
                  </span>
                )}
              </span>
              {index < WORKFLOW_STEPS.length - 1 && (
                <span
                  className={`mx-0.5 h-px w-4 sm:w-6 ${
                    done ? "bg-primary-300" : "bg-background-300"
                  }`}
                  aria-hidden="true"
                ></span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * 販売管理タブ: 公開状態 / 在庫状態を1つのカードにまとめた設定ブロック。
 * カード先頭に進行ステップ、最下部に「管理操作」（アーカイブ・完全削除）を分離して置く。
 * 表示と入力の受け渡しのみを担当し、保存処理は呼び出し元（商品詳細ページ）が持つ。
 */
export default function SalesManagementPanel({
  publish,
  inventory,
  record,
  workflow,
}: SalesManagementPanelProps) {
  const publishDirty = publish.selectedStatus !== publish.currentStatus;
  const inventoryDirty = inventory.selectedStatus !== inventory.currentStatus;
  const recordLabel =
    RECORD_STATUS_LABELS[record.recordStatus] ?? record.recordStatus ?? "—";
  const isArchived = record.recordStatus !== "active";

  return (
    <div className="ui-card rounded-lg">
      {/* 見出し + 現在の状態バッジ */}
      <div className="border-b border-background-100 px-4 py-3 md:px-5">
        <SectionHeading
          eyebrow="Sales Control"
          title="販売管理"
          icon="ri-store-3-line"
          description="変更は保存ボタンで反映されます"
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 並び順は全画面で統一: 公開 → 在庫 → レコード */}
              <StatusChip
                label={`公開: ${publish.statusLabel}`}
                tone={
                  publish.currentStatus === "published"
                    ? "publish"
                    : "publish-off"
                }
              />
              <StatusChip
                label={`在庫: ${inventory.inventoryLabel}`}
                tone="inventory"
              />
              <StatusChip label={`レコード: ${recordLabel}`} tone="link" />
            </div>
          }
        />
      </div>

      {/* 進行ステップ（取込 → AI生成 → 確認 → 公開） */}
      <WorkflowSteps workflow={workflow} />

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
      </div>

      {/* 管理操作: 通常の設定と同列に置かず、カード最下部に控えめに隔離する */}
      <div className="border-t border-background-200 bg-background-50 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="admin-eyebrow text-[9px] font-semibold text-foreground-400">
              Manage
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-foreground-800">
              管理操作
              <span className="ml-1.5 text-[11px] font-normal text-foreground-500">
                レコード: {recordLabel}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-foreground-500">
              {isArchived
                ? "アーカイブ済みです。復元すると通常の商品一覧に戻ります（データは残ります）。"
                : "アーカイブすると通常の商品一覧から外れます。削除はアーカイブ後にのみ行えます。"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isArchived ? (
              <button
                type="button"
                onClick={record.onSelectActive}
                disabled={record.saving}
                className="inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-arrow-go-back-line w-3.5 h-3.5 flex items-center justify-center"></i>
                復元する
              </button>
            ) : (
              <button
                type="button"
                onClick={record.onSelectArchived}
                disabled={record.saving}
                className="inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-background-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground-600 transition-colors hover:border-background-400 hover:bg-background-100 hover:text-foreground-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-archive-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
                アーカイブ
              </button>
            )}

            {isArchived && (
              <button
                type="button"
                onClick={record.onRequestDelete}
                disabled={record.saving}
                className="inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-transparent px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="ri-delete-bin-6-line w-3.5 h-3.5 flex items-center justify-center"></i>
                完全削除
              </button>
            )}
          </div>
        </div>

        {(record.saving || record.message) && (
          <div className="mt-2">
            {record.saving && (
              <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-400">
                <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
                処理中...
              </p>
            )}
            {record.message && (
              <SaveStatusMessage
                tone={record.message.type}
                text={record.message.text}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
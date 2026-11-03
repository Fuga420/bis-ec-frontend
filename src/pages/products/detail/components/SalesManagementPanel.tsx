import type { ReactNode } from "react";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { RECORD_STATUS_LABELS } from "@/pages/products/types";
import CataloguePanelHeading from "./CataloguePanelHeading";

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
  // Square（販売チャネル）へ連携済み
  squareLinked: boolean;
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

const ROW =
  "flex flex-col gap-3 border-b border-[var(--cat-rule-soft)] py-4 sm:flex-row sm:items-start sm:gap-6";
const LABEL_CELL =
  "w-full shrink-0 text-[10px] leading-5 tracking-[0.18em] text-[var(--cat-ink-soft)] sm:w-[104px]";

/** 保存ボタン（図録調の細罫線ボタン。主要操作なので枠線は濃いめ） */
function ActionButton({
  onClick,
  disabled,
  saving,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  saving: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--cat-ink)] px-3 py-1.5 text-[11px] tracking-[0.12em] text-[var(--cat-ink)] transition-colors hover:bg-[var(--cat-ink)] hover:text-[var(--cat-paper)] disabled:cursor-not-allowed disabled:border-[var(--cat-rule)] disabled:bg-transparent disabled:text-[var(--cat-ink-soft)] disabled:opacity-60"
    >
      {saving ? (
        <>
          <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
          保存中
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

/** 文字ベースの切替（選択中だけ深緑の太字＋下線） */
function TextToggleGroup({
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
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={disabled}
            className={`cursor-pointer whitespace-nowrap border-b pb-1 text-[12.5px] leading-none tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-[var(--cat-green)] font-semibold text-[var(--cat-green)]"
                : "border-transparent text-[var(--cat-ink-soft)] hover:text-[var(--cat-ink)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const WORKFLOW_STEPS = [
  { key: "imported", label: "取込" },
  { key: "aiGenerated", label: "AI生成" },
  { key: "reviewed", label: "確認" },
  { key: "published", label: "公開" },
  { key: "squareLinked", label: "Square連携" },
] as const;

/** 取込 → AI生成 → 確認 → 公開 のステップ（数字の列として罫線の上に置く） */
function WorkflowLine({ workflow }: { workflow: SalesWorkflow }) {
  const doneList = WORKFLOW_STEPS.map((step) => {
    if (step.key === "imported") return workflow.imported;
    if (step.key === "aiGenerated") return workflow.aiGenerated;
    if (step.key === "reviewed") return workflow.reviewed;
    if (step.key === "published") return workflow.published;
    return workflow.squareLinked;
  });
  const currentIndex = doneList.findIndex((done) => !done);

  return (
    <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
      {WORKFLOW_STEPS.map((step, index) => {
        const done = doneList[index];
        const current = index === currentIndex;
        return (
          <div key={step.key} className="flex items-baseline gap-1.5">
            <dt
              className={`cat-mono text-[9px] leading-none tracking-[0.16em] ${
                done
                  ? "text-[var(--cat-green)]"
                  : current
                    ? "text-[var(--cat-ink)]"
                    : "text-[var(--cat-rule)]"
              }`}
            >
              {done ? "✓" : String(index + 1).padStart(2, "0")}
            </dt>
            <dd
              className={`whitespace-nowrap text-[10.5px] leading-none tracking-[0.12em] ${
                current
                  ? "font-semibold text-[var(--cat-green)]"
                  : done
                    ? "text-[var(--cat-ink)]"
                    : "text-[var(--cat-ink-soft)]"
              }`}
            >
              {step.label}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function StatusRow({
  label,
  message,
  children,
}: {
  label: string;
  message?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={ROW}>
      <dt className={LABEL_CELL}>{label}</dt>
      <dd className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 sm:justify-end">
          {children}
        </div>
        {message}
      </dd>
    </div>
  );
}

/**
 * 販売管理: 公開状態 / 在庫状態を1つの罫線テーブルにまとめた設定ブロック。
 * 切替はカード型のセグメントではなく「選択中だけ深緑の太字＋下線」の文字表示。
 * アーカイブ・完全削除は通常操作と分け、最下部の独立した「管理操作」ゾーンに隔離する。
 * 保存処理は呼び出し元（商品詳細ページ）が持ち、ここは表示と入力の受け渡しのみ。
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
    <section>
      <CataloguePanelHeading
        number="01"
        title="販売管理"
        eyebrow="Sales Control"
        right={
          <span className="cat-mono text-[9px] tracking-[0.18em] text-[var(--cat-ink-soft)]">
            {publishDirty || inventoryDirty ? "UNSAVED" : "SAVED"}
          </span>
        }
      />

      {/* 現在の状態（表示のみ） */}
      <p className="cat-mono mt-3 text-[9.5px] leading-5 tracking-[0.14em] text-[var(--cat-ink-soft)]">
        公開 {publish.statusLabel} · 在庫 {inventory.inventoryLabel} · レコード{" "}
        {recordLabel}
      </p>

      <WorkflowLine workflow={workflow} />

      <dl className="mt-5 border-t border-[var(--cat-rule-soft)]">
        <StatusRow
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
          <TextToggleGroup
            options={PUBLISH_STATUS_OPTIONS}
            value={publish.selectedStatus}
            onChange={publish.onSelect}
          />
          <div className="flex items-center gap-3">
            <ActionButton
              saving={publish.saving}
              disabled={!publishDirty}
              label="公開状態を保存"
              onClick={publish.onSave}
            />
            {!publish.saving && publishDirty && (
              <span className="cat-mono whitespace-nowrap text-[9px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
                未保存
              </span>
            )}
          </div>
        </StatusRow>

        <StatusRow
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
          <TextToggleGroup
            options={INVENTORY_STATUS_OPTIONS}
            value={inventory.selectedStatus}
            onChange={inventory.onSelect}
          />
          <div className="flex items-center gap-3">
            <ActionButton
              saving={inventory.saving}
              disabled={!inventoryDirty}
              label="在庫状態を保存"
              onClick={inventory.onSave}
            />
            {!inventory.saving && inventoryDirty && (
              <span className="cat-mono whitespace-nowrap text-[9px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
                未保存
              </span>
            )}
          </div>
        </StatusRow>
      </dl>

      {/* 管理操作: 通常の設定と同列に置かず、最下部の独立したゾーンに隔離する */}
      <div className="mt-8 border border-[#dcc0b9] px-4 py-4 md:px-5">
        <p className="cat-mono text-[9px] uppercase tracking-[0.26em] text-[#a4554a]">
          Manage
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="cat-serif text-[13px] tracking-[0.08em] text-[var(--cat-ink)]">
            管理操作
          </h3>
          <p className="cat-mono text-[9px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
            RECORD {recordLabel}
          </p>
        </div>
        <p className="mt-2 max-w-[62ch] text-[11.5px] leading-[1.9] text-[var(--cat-ink-soft)]">
          {isArchived
            ? "アーカイブ済みです。復元すると通常の商品一覧に戻ります（データは残ります）。"
            : "アーカイブすると通常の商品一覧から外れます。削除はアーカイブ後にのみ行えます。"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {isArchived ? (
            <button
              type="button"
              onClick={record.onSelectActive}
              disabled={record.saving}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--cat-rule)] px-3 py-1.5 text-[11px] tracking-[0.12em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-ink)] hover:text-[var(--cat-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-arrow-go-back-line w-3.5 h-3.5 flex items-center justify-center"></i>
              復元する
            </button>
          ) : (
            <button
              type="button"
              onClick={record.onSelectArchived}
              disabled={record.saving}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[#c98f86] px-3 py-1.5 text-[11px] tracking-[0.12em] text-[#8f3f34] transition-colors hover:bg-[#8f3f34] hover:text-[var(--cat-paper)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-archive-2-line w-3.5 h-3.5 flex items-center justify-center"></i>
              アーカイブする
            </button>
          )}

          {isArchived && (
            <button
              type="button"
              onClick={record.onRequestDelete}
              disabled={record.saving}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-b border-transparent px-0.5 py-1 text-[11px] tracking-[0.12em] text-[#8f3f34] transition-colors hover:border-[#8f3f34] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="ri-delete-bin-6-line w-3.5 h-3.5 flex items-center justify-center"></i>
              完全削除
            </button>
          )}
        </div>

        {(record.saving || record.message) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {record.saving && (
              <p className="cat-mono inline-flex items-center gap-1.5 text-[9.5px] tracking-[0.14em] text-[var(--cat-ink-soft)]">
                <i className="ri-loader-4-line animate-spin w-3 h-3 flex items-center justify-center"></i>
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
    </section>
  );
}
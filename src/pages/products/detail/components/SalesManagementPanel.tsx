import { useEffect, useState } from "react";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import { RECORD_STATUS_LABELS } from "@/pages/products/types";
import CataloguePanelHeading from "./CataloguePanelHeading";

type SaveMessage = { type: "success" | "error"; text: string } | null;

interface SegmentOption {
  value: string;
  label: string;
}

/**
 * 登録状況の補助表示用。
 * ここに出しているのは実際のデータから判定した値のみ（装飾用の工程は持たない）。
 */
export interface SalesWorkflow {
  // AIによる下書き（価格案）が存在するか
  aiGenerated: boolean;
  // 販売予定価格が確定しているか
  reviewed: boolean;
  // 公開中か
  published: boolean;
}

interface SalesManagementPanelProps {
  publish: {
    statusLabel: string;
    currentStatus: string;
    selectedStatus: string;
    saving: boolean;
    disabled?: boolean;
    disabledReason?: string;
    message: SaveMessage;
    // 選択時: 選択値だけを親に伝える（保存はまだしない）
    onSelect: (value: string) => void;
    // 確認の帯で「変更を保存」を押したとき: 選択値を保存する
    onConfirmSave: () => void;
    // 確認の帯で「キャンセル」を押したとき: 選択を元に戻す
    onCancel: () => void;
  };
  inventory: {
    inventoryLabel: string;
    currentStatus: string;
    selectedStatus: string;
    saving: boolean;
    message: SaveMessage;
    // 選択時: その場で保存する（確認なし）
    onSelect: (value: string) => void;
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

const PUBLISH_STATUS_TEXT: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  hidden: "非公開",
};

const ROW =
  "flex flex-col gap-1.5 border-t border-background-200 py-3 sm:flex-row sm:items-start sm:gap-6";
const LABEL_CELL =
  "w-full shrink-0 pt-1 text-[12px] leading-5 text-foreground-500 sm:w-[96px]";

/** 状態チップ: 既存のステータスバッジ（意味で色が固定）をそのまま使う */
function StatusChip({ value, className }: { value: string; className: string }) {
  return <span className={`st-badge ${className}`}>{value}</span>;
}

/** セグメントコントロール: 薄いグレーの溝に白い選択中タブを載せる */
function SegmentControl({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-background-100 p-1"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={disabled}
            className={`cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-white font-semibold text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 行の右に出す保存状態（保存中… / 保存しました / 失敗） */
function InlineSaveState({
  saving,
  success,
  failed,
}: {
  saving: boolean;
  success: boolean;
  failed: boolean;
}) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-foreground-500">
        <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
        保存中…
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-amber-700">
        <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
        保存に失敗しました
      </span>
    );
  }
  if (success) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-primary-700">
        <i className="ri-check-line w-3.5 h-3.5 flex items-center justify-center"></i>
        保存しました
      </span>
    );
  }
  return null;
}

/** データに連動した補助情報（AI下書き / 価格設定 / 公開）を1行にまとめる */
function ProgressSummary({ workflow }: { workflow: SalesWorkflow }) {
  const items = [
    { key: "ai", label: "AI下書き", done: workflow.aiGenerated, onText: "あり", offText: "なし" },
    { key: "price", label: "価格設定", done: workflow.reviewed, onText: "済み", offText: "未設定" },
    { key: "publish", label: "公開", done: workflow.published, onText: "公開中", offText: "未公開" },
  ];

  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <dt className="text-[11.5px] text-foreground-500">{item.label}</dt>
          <dd
            className={`text-[11.5px] font-medium ${
              item.done ? "text-foreground-900" : "text-foreground-400"
            }`}
          >
            {item.done ? item.onText : item.offText}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 販売管理: 公開状態 / 在庫状態 / レコード状態の3つに絞ったステータス管理。
 * 公開は「選択 → 確認して保存」、在庫は選択時に即時保存（既存の保存処理のまま）。
 * 保存処理そのものは呼び出し元（商品詳細ページ）が持ち、ここは表示と入力の受け渡しのみ。
 */
export default function SalesManagementPanel({
  publish,
  inventory,
  record,
  workflow,
}: SalesManagementPanelProps) {
  // 公開状態の確認待ち（未保存の選択）。保存完了・商品切り替えで閉じる。
  const [pendingPublish, setPendingPublish] = useState<string | null>(null);

  useEffect(() => {
    setPendingPublish(null);
  }, [publish.currentStatus]);

  const recordLabel =
    RECORD_STATUS_LABELS[record.recordStatus] ?? record.recordStatus ?? "—";
  const isArchived = record.recordStatus !== "active";

  const publishFailed = publish.message?.type === "error";
  const inventoryFailed = inventory.message?.type === "error";
  const isSaving = publish.saving || inventory.saving;
  const hasError = publishFailed || inventoryFailed;

  const pendingLabel = pendingPublish
    ? PUBLISH_STATUS_TEXT[pendingPublish] ?? pendingPublish
    : "";
  const currentPublishLabel =
    PUBLISH_STATUS_TEXT[publish.currentStatus] ?? publish.statusLabel;

  return (
    <section>
      <CataloguePanelHeading
        title="販売管理"
        right={
          isSaving ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-foreground-500">
              <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
              保存中…
            </span>
          ) : hasError ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-amber-700">
              <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
              保存に失敗しました
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-primary-700">
              <i className="ri-check-line w-3.5 h-3.5 flex items-center justify-center"></i>
              すべて保存済み
            </span>
          )
        }
      />

      <ProgressSummary workflow={workflow} />

      <dl className="mt-3">
        {/* 公開状態 */}
        <div className={ROW}>
          <dt className={LABEL_CELL}>公開状態</dt>
          <dd className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SegmentControl
                ariaLabel="公開状態"
                options={PUBLISH_STATUS_OPTIONS}
                value={pendingPublish ?? publish.selectedStatus}
                disabled={publish.saving || Boolean(publish.disabled)}
                onChange={(value) => {
                  if (publish.disabled) return;
                  if (value === publish.currentStatus) {
                    setPendingPublish(null);
                    publish.onCancel();
                    return;
                  }
                  setPendingPublish(value);
                  publish.onSelect(value);
                }}
              />
              <InlineSaveState
                saving={publish.saving}
                success={!publish.saving && publish.message?.type === "success"}
                failed={!publish.saving && publishFailed}
              />
            </div>

            {pendingPublish && (
              <div className="mt-2 rounded-md border border-background-200 bg-background-50 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="st-badge st-muted">未保存の変更</span>
                  <p className="text-[12px] leading-relaxed text-foreground-900">
                    {`${currentPublishLabel} → ${pendingLabel}`}
                    <span className="ml-1.5 text-foreground-500">
                      {pendingPublish === "published"
                        ? "店舗に表示されます"
                        : "店舗では表示されません"}
                    </span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      publish.onConfirmSave();
                      setPendingPublish(null);
                    }}
                    disabled={publish.saving}
                    className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    変更を保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      publish.onCancel();
                      setPendingPublish(null);
                    }}
                    disabled={publish.saving}
                    className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {publish.disabled && publish.disabledReason && (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-foreground-500">
                <i className="ri-flask-line mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center"></i>
                <span>{publish.disabledReason}</span>
              </p>
            )}

            {publish.message?.type === "error" && (
              <SaveStatusMessage
                tone="error"
                text={publish.message.text}
                className="mt-2"
              />
            )}
          </dd>
        </div>

        {/* 在庫状態 */}
        <div className={ROW}>
          <dt className={LABEL_CELL}>在庫状態</dt>
          <dd className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SegmentControl
                ariaLabel="在庫状態"
                options={INVENTORY_STATUS_OPTIONS}
                value={inventory.selectedStatus}
                disabled={inventory.saving}
                onChange={inventory.onSelect}
              />
              <InlineSaveState
                saving={inventory.saving}
                success={!inventory.saving && inventory.message?.type === "success"}
                failed={!inventory.saving && inventoryFailed}
              />
            </div>

            {inventory.message?.type === "error" && (
              <SaveStatusMessage
                tone="error"
                text={inventory.message.text}
                className="mt-2"
              />
            )}
          </dd>
        </div>

        {/* レコード状態（アーカイブ / 復元 / 完全削除） */}
        <div className={ROW}>
          <dt className={LABEL_CELL}>レコード状態</dt>
          <dd className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <StatusChip
                  value={recordLabel}
                  className={isArchived ? "st-muted" : "st-publish"}
                />
                <span className="text-[11.5px] leading-relaxed text-foreground-500">
                  {isArchived
                    ? "通常の商品一覧から外れています。復元すると一覧に戻ります。"
                    : "通常の商品一覧に表示されています。"}
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {isArchived ? (
                  <button
                    type="button"
                    onClick={record.onSelectActive}
                    disabled={record.saving}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-background-300 bg-white px-3 py-1.5 text-[12px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-arrow-go-back-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    復元する
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={record.onSelectArchived}
                    disabled={record.saving}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <i className="ri-delete-bin-6-line w-3.5 h-3.5 flex items-center justify-center"></i>
                    完全削除
                  </button>
                )}
              </div>
            </div>

            {(record.saving || record.message) && (
              <div className="mt-2 flex flex-col gap-1.5">
                {record.saving && (
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] text-foreground-500">
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
          </dd>
        </div>
      </dl>
    </section>
  );
}
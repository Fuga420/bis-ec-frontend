import { useEffect, useState, type ReactNode } from "react";
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
    // 選択時: 選択値だけを親に伝える（保存はまだしない）
    onSelect: (value: string) => void;
    // 確認の帯で「変更する」を押したとき: 選択値を保存する
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
  "flex flex-col gap-3 border-b border-[var(--cat-rule-soft)] py-4 sm:flex-row sm:items-start sm:gap-6";
const LABEL_CELL =
  "w-full shrink-0 text-[10px] leading-5 tracking-[0.18em] text-[var(--cat-ink-soft)] sm:w-[104px]";

/** 状態チップ: ベタ塗り（公開中）／深緑の枠線（在庫あり）／グレーの枠線（通常） */
function StatusChip({
  value,
  tone,
}: {
  value: string;
  tone: "solid" | "outline-green" | "outline-gray";
}) {
  const toneClass =
    tone === "solid"
      ? "border-[var(--cat-green)] bg-[var(--cat-green)] text-white"
      : tone === "outline-green"
        ? "border-[var(--cat-green)] bg-transparent text-[var(--cat-green)]"
        : "border-[var(--cat-rule)] bg-transparent text-[var(--cat-ink-soft)]";

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-[11px] leading-5 tracking-[0.08em] ${toneClass}`}
    >
      {value}
    </span>
  );
}

/** セグメントコントロール: 選択中のみ深緑のベタ塗り＋白文字 */
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
      className="inline-flex max-w-full flex-wrap border border-[var(--cat-rule)]"
    >
      {options.map((option, index) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            disabled={disabled}
            className={`cursor-pointer whitespace-nowrap border-[var(--cat-rule)] px-3.5 py-1.5 text-[11.5px] leading-5 tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              index < options.length - 1 ? "border-r" : ""
            } ${
              active
                ? "bg-[var(--cat-green)] text-white"
                : "bg-transparent text-[var(--cat-ink-soft)] hover:text-[var(--cat-ink)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** 行の右に出す保存状態（保存中… / ✓ 保存しました / 失敗） */
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
      <span className="cat-mono inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] tracking-[0.14em] text-[var(--cat-ink-soft)]">
        <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
        保存中…
      </span>
    );
  }
  if (failed) {
    return (
      <span className="cat-mono inline-flex items-center gap-1 whitespace-nowrap text-[10px] tracking-[0.14em] text-[#8f3f34]">
        <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
        保存に失敗しました
      </span>
    );
  }
  if (success) {
    return (
      <span className="cat-mono inline-flex items-center gap-1 whitespace-nowrap text-[10px] tracking-[0.14em] text-[var(--cat-green)]">
        ✓ 保存しました
      </span>
    );
  }
  return null;
}

const WORKFLOW_STEPS = [
  { key: "imported", label: "取込" },
  { key: "aiGenerated", label: "AI生成" },
  { key: "reviewed", label: "確認" },
  { key: "published", label: "公開" },
  { key: "squareLinked", label: "Square連携" },
] as const;

/** 取込 → AI生成 → 確認 → 公開 → Square連携 のステップ（完了はチェック、現在地は太字＋下線） */
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
    <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
      {WORKFLOW_STEPS.map((step, index) => {
        const done = doneList[index];
        const current = index === currentIndex;
        return (
          <div key={step.key} className="flex items-baseline gap-1.5">
            <dt
              className={`cat-mono text-[9px] leading-none tracking-[0.16em] ${
                done
                  ? "text-[var(--cat-ink)]"
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
                  ? "border-b border-[var(--cat-green)] pb-0.5 font-semibold text-[var(--cat-ink)]"
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {children}
        </div>
        {message}
      </dd>
    </div>
  );
}

/**
 * 販売管理: 公開状態 / 在庫状態 / レコード状態を1つの罫線テーブルにまとめた設定ブロック。
 * 公開・在庫はセグメントコントロールで選び、在庫は即時保存・公開のみ確認の帯を挟んで保存する。
 * 保存処理そのものは呼び出し元（商品詳細ページ）が持ち、ここは表示と入力の受け渡しのみ。
 */
export default function SalesManagementPanel({
  publish,
  inventory,
  record,
  workflow,
}: SalesManagementPanelProps) {
  // 公開状態の確認の帯（公開だけは即時保存せず、ここで確認する）
  const [pendingPublish, setPendingPublish] = useState<string | null>(null);

  // 公開状態が変わったら（保存完了・商品切り替えなど）確認の帯は閉じる
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

  return (
    <section>
      <CataloguePanelHeading
        number="01"
        title="販売管理"
        eyebrow="Sales Control"
        right={
          isSaving ? (
            <span className="cat-mono inline-flex items-center gap-1.5 whitespace-nowrap text-[9px] tracking-[0.18em] text-[var(--cat-ink-soft)]">
              <i className="ri-loader-4-line animate-spin w-3.5 h-3.5 flex items-center justify-center"></i>
              保存中…
            </span>
          ) : hasError ? (
            <span className="cat-mono whitespace-nowrap text-[9px] tracking-[0.18em] text-[#8f3f34]">
              ! 保存に失敗しました
            </span>
          ) : (
            <span className="cat-mono whitespace-nowrap text-[9px] tracking-[0.18em] text-[var(--cat-green)]">
              ✓ すべて保存済み
            </span>
          )
        }
      />

      {/* 現在の状態（ラベル＋チップ） */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="cat-mono text-[9px] tracking-[0.18em] text-[var(--cat-ink-soft)]">
            公開
          </span>
          <StatusChip
            value={publish.statusLabel}
            tone={publish.currentStatus === "published" ? "solid" : "outline-gray"}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="cat-mono text-[9px] tracking-[0.18em] text-[var(--cat-ink-soft)]">
            在庫
          </span>
          <StatusChip
            value={inventory.inventoryLabel}
            tone={
              inventory.currentStatus === "in_stock"
                ? "outline-green"
                : "outline-gray"
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="cat-mono text-[9px] tracking-[0.18em] text-[var(--cat-ink-soft)]">
            レコード
          </span>
          <StatusChip value={recordLabel} tone="outline-gray" />
        </div>
      </div>

      <WorkflowLine workflow={workflow} />

      <dl className="mt-5 border-t border-[var(--cat-rule-soft)]">
        <StatusRow
          label="公開状態"
          message={
            <>
              {pendingPublish && (
                <div className="mt-3 border border-[var(--cat-green)] bg-[rgba(18,80,44,0.04)] px-3 py-2.5">
                  <p className="text-[11.5px] leading-[1.8] text-[var(--cat-ink)]">
                    {`公開状態を『${
                      PUBLISH_STATUS_TEXT[publish.currentStatus] ??
                      publish.statusLabel
                    }』→『${
                      PUBLISH_STATUS_TEXT[pendingPublish] ?? pendingPublish
                    }』に変更しますか？`}
                  </p>
                  <p className="mt-1 text-[11px] leading-[1.8] text-[var(--cat-ink-soft)]">
                    {pendingPublish === "published"
                      ? "店舗に表示されます。"
                      : "店舗では非表示になります。"}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        publish.onConfirmSave();
                        setPendingPublish(null);
                      }}
                      disabled={publish.saving}
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--cat-green)] bg-[var(--cat-green)] px-3 py-1.5 text-[11px] tracking-[0.12em] text-white transition-colors hover:bg-[#0d3d21] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      変更する
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        publish.onCancel();
                        setPendingPublish(null);
                      }}
                      disabled={publish.saving}
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--cat-rule)] bg-transparent px-3 py-1.5 text-[11px] tracking-[0.12em] text-[var(--cat-ink-soft)] transition-colors hover:border-[var(--cat-ink)] hover:text-[var(--cat-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
              {publish.message?.type === "error" && (
                <SaveStatusMessage
                  tone="error"
                  text={publish.message.text}
                  className="mt-2"
                />
              )}
            </>
          }
        >
          <SegmentControl
            ariaLabel="公開状態"
            options={PUBLISH_STATUS_OPTIONS}
            value={pendingPublish ?? publish.selectedStatus}
            disabled={publish.saving}
            onChange={(value) => {
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
        </StatusRow>

        <StatusRow
          label="在庫状態"
          message={
            inventory.message?.type === "error" ? (
              <SaveStatusMessage
                tone="error"
                text={inventory.message.text}
                className="mt-2"
              />
            ) : null
          }
        >
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
        </StatusRow>
      </dl>

      {/* 管理操作: 通常の設定と分け、罫線で区切ったコンパクトな行にする */}
      <div className="mt-6 border-t border-[var(--cat-rule-soft)] pt-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="cat-mono text-[9px] uppercase tracking-[0.26em] text-[#a4554a]">
                Manage
              </p>
              <h3 className="cat-serif text-[12.5px] tracking-[0.08em] text-[var(--cat-ink)]">
                管理操作
              </h3>
              <p className="cat-mono text-[9px] tracking-[0.16em] text-[var(--cat-ink-soft)]">
                RECORD {recordLabel}
              </p>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-[1.85] text-[var(--cat-ink-soft)] [text-wrap:pretty]">
              {isArchived
                ? "アーカイブ済みです。復元すると通常の商品一覧に戻ります（データは残ります）。"
                : "アーカイブすると通常の商品一覧から外れます。削除はアーカイブ後にのみ行えます。"}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
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
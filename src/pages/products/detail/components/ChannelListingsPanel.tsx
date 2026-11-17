import { useCallback, useEffect, useState } from "react";
import CatalogueSubHeading from "@/pages/products/detail/components/CatalogueSubHeading";
import {
  CHANNEL_DEFINITIONS,
  CHANNEL_STATUS_LABELS,
  CHANNEL_STATUS_OPTIONS,
  fetchChannelListings,
  updateChannelListing,
  type ChannelKey,
  type ChannelListing,
  type ChannelListingStatus,
} from "@/pages/products/detail/lib/channelListings";

type LoadState = "loading" | "success" | "error";

interface ChannelDraft {
  status: ChannelListingStatus;
  price: string;
  url: string;
  note: string;
}

type Drafts = Record<ChannelKey, ChannelDraft>;

type ChannelMessage = { type: "success" | "error"; text: string } | null;

function buildDrafts(listings: ChannelListing[]): Drafts {
  const result = {} as Drafts;
  CHANNEL_DEFINITIONS.forEach((def) => {
    const listing = listings.find((entry) => entry.channel === def.key);
    result[def.key] = {
      status: listing?.status ?? "not_listed",
      price:
        listing?.price_jpy != null ? String(listing.price_jpy) : "",
      url: listing?.listing_url ?? "",
      note: listing?.note ?? "",
    };
  });
  return result;
}

function emptyDrafts(): Drafts {
  const result = {} as Drafts;
  CHANNEL_DEFINITIONS.forEach((def) => {
    result[def.key] = { status: "not_listed", price: "", url: "", note: "" };
  });
  return result;
}

function channelLabel(channel: ChannelKey): string {
  return (
    CHANNEL_DEFINITIONS.find((def) => def.key === channel)?.label ?? channel
  );
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const STATUS_BADGE_STYLES: Record<ChannelListingStatus, string> = {
  not_listed: "border-background-300 bg-white text-foreground-500",
  listed: "border-primary-300 bg-primary-50 text-primary-700",
  sold: "border-amber-300 bg-amber-50 text-amber-800",
  delisted: "border-background-300 bg-background-50 text-foreground-600",
};

const FIELD_CLASS =
  "h-8 w-full min-w-0 rounded-md border border-background-300 bg-white px-2.5 text-[12px] text-foreground-900 placeholder:text-foreground-400 transition-colors focus:border-foreground-500 focus:outline-none focus:ring-2 focus:ring-foreground-200 disabled:cursor-not-allowed disabled:opacity-60";

const LABEL_CLASS = "text-[11px] leading-none text-foreground-500";

interface ChannelListingsPanelProps {
  productId: string;
}

/**
 * 商品詳細の「出品チャネル」セクション。
 *
 * Mercari Shops / eBay / スニーカーダンクの3チャネルについて、
 * 状態・価格・URL・メモをチャネル単位で編集・保存する。
 * いずれかのチャネルが売却済みになると、まだ出品中の他チャネルが
 * delist_targets として返るため、取り下げ対象を目立つ形で警告する
 * （1点もののため、1か所で売れたら他は即取り下げという業務ルール）。
 */
export default function ChannelListingsPanel({
  productId,
}: ChannelListingsPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [listings, setListings] = useState<ChannelListing[]>([]);
  const [delistTargets, setDelistTargets] = useState<ChannelKey[]>([]);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [savingChannel, setSavingChannel] = useState<ChannelKey | null>(null);
  const [messages, setMessages] = useState<Record<ChannelKey, ChannelMessage>>(
    () => ({ mercari_shops: null, ebay: null, snkrdunk: null })
  );

  const load = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage("");
    setMessages({ mercari_shops: null, ebay: null, snkrdunk: null });
    try {
      const result = await fetchChannelListings(productId);
      setListings(result.listings);
      setDelistTargets(result.delistTargets);
      setDrafts(buildDrafts(result.listings));
      setLoadState("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "出品チャネルを取得できませんでした。"
      );
      setLoadState("error");
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (channel: ChannelKey, patch: Partial<ChannelDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], ...patch },
    }));
    setMessages((prev) => ({ ...prev, [channel]: null }));
  };

  const handleSave = async (channel: ChannelKey) => {
    const draft = drafts[channel];
    if (!draft || savingChannel) return;

    const priceText = draft.price.replace(/[,\s]/g, "");
    let priceValue: number | null = null;
    if (priceText !== "") {
      const parsed = Number(priceText);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setMessages((prev) => ({
          ...prev,
          [channel]: { type: "error", text: "価格は0以上の数値で入力してください。" },
        }));
        return;
      }
      priceValue = Math.trunc(parsed);
    }

    setSavingChannel(channel);
    setMessages((prev) => ({ ...prev, [channel]: null }));
    try {
      const result = await updateChannelListing(productId, channel, {
        status: draft.status,
        listing_url: draft.url.trim() ? draft.url.trim() : null,
        price_jpy: priceValue,
        note: draft.note.trim() ? draft.note.trim() : null,
      });
      setListings(result.listings);
      setDelistTargets(result.delistTargets);
      setDrafts(buildDrafts(result.listings));
      setMessages((prev) => ({
        ...prev,
        [channel]: { type: "success", text: "保存しました" },
      }));
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [channel]: {
          type: "error",
          text:
            err instanceof Error && err.message
              ? err.message
              : "保存に失敗しました。",
        },
      }));
    } finally {
      setSavingChannel(null);
    }
  };

  const targetLabels = delistTargets.map(channelLabel);

  return (
    <section>
      <CatalogueSubHeading
        title="チャネル別の出品状況"
        right={
          loadState === "success" ? (
            <span className="whitespace-nowrap text-[11px] leading-none text-foreground-400">
              3チャネル
            </span>
          ) : undefined
        }
      />

      {loadState === "loading" && (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="product-skeleton-block h-[104px] w-full rounded-md"
            ></div>
          ))}
        </div>
      )}

      {loadState === "error" && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="break-words text-[12px] leading-relaxed text-amber-800">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-amber-300 bg-white px-2.5 text-[12px] font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <i className="ri-refresh-line h-3.5 w-3.5 flex items-center justify-center text-[13px]"></i>
            再読み込み
          </button>
        </div>
      )}

      {loadState === "success" && (
        <>
          {delistTargets.length > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <i
                  className="ri-alert-line mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center text-[16px] text-amber-700"
                  aria-hidden="true"
                ></i>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold leading-snug text-amber-900">
                    他チャネルの取り下げが必要です
                  </p>
                  <p className="mt-1 break-words text-[11.5px] leading-relaxed text-amber-800">
                    {targetLabels.join(" / ")}{" "}
                    がまだ出品中です。1点もののため、いずれかで売却された時点で
                    他の出品は即時に取り下げてください。
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2.5">
            {CHANNEL_DEFINITIONS.map((def) => {
              const listing = listings.find(
                (entry) => entry.channel === def.key
              );
              const draft = drafts[def.key];
              const isTarget = delistTargets.includes(def.key);
              const message = messages[def.key];
              const saving = savingChannel === def.key;
              const dateMeta = [
                listing?.listed_at
                  ? `出品日 ${formatDate(listing.listed_at)}`
                  : "",
                listing?.sold_at ? `売却日 ${formatDate(listing.sold_at)}` : "",
              ]
                .filter(Boolean)
                .join(" ／ ");

              return (
                <div
                  key={def.key}
                  className={`rounded-md border px-3 py-2.5 ${
                    isTarget
                      ? "border-amber-400 bg-amber-50"
                      : "border-background-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="whitespace-nowrap text-[13px] font-semibold leading-none text-foreground-950">
                        {def.label}
                      </span>
                      <span
                        className={`inline-flex h-[20px] items-center whitespace-nowrap rounded border px-1.5 text-[10.5px] leading-none ${
                          STATUS_BADGE_STYLES[draft.status]
                        }`}
                      >
                        {CHANNEL_STATUS_LABELS[draft.status]}
                      </span>
                      {isTarget && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-medium leading-none text-amber-800">
                          <i
                            className="ri-error-warning-line h-3.5 w-3.5 flex items-center justify-center text-[13px]"
                            aria-hidden="true"
                          ></i>
                          取り下げ対象
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {dateMeta && (
                        <span className="whitespace-nowrap text-[10.5px] leading-none text-foreground-400">
                          {dateMeta}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSave(def.key)}
                        disabled={saving || savingChannel !== null}
                        className="inline-flex h-7 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border border-background-300 bg-white px-2.5 text-[11.5px] font-medium text-foreground-700 transition-colors hover:bg-background-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? (
                          <i className="ri-loader-4-line h-3.5 w-3.5 animate-spin flex items-center justify-center text-[13px]"></i>
                        ) : null}
                        {saving ? "保存中" : "保存"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`${LABEL_CLASS} w-9 shrink-0`}>状態</span>
                    <div
                      role="group"
                      aria-label={`${def.label}の出品状態`}
                      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md bg-background-100 p-0.5"
                    >
                      {CHANNEL_STATUS_OPTIONS.map((status) => {
                        const active = draft.status === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() =>
                              updateDraft(def.key, { status })
                            }
                            aria-pressed={active}
                            disabled={savingChannel !== null}
                            className={`cursor-pointer whitespace-nowrap rounded px-2 py-1 text-[11px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              active
                                ? "bg-white font-semibold text-foreground-950"
                                : "text-foreground-600 hover:text-foreground-900"
                            }`}
                          >
                            {CHANNEL_STATUS_LABELS[status]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_128px]">
                    <div className="min-w-0">
                      <label
                        htmlFor={`channel-url-${def.key}`}
                        className={LABEL_CLASS}
                      >
                        出品URL
                      </label>
                      <input
                        id={`channel-url-${def.key}`}
                        type="url"
                        inputMode="url"
                        value={draft.url}
                        disabled={savingChannel !== null}
                        onChange={(e) =>
                          updateDraft(def.key, { url: e.target.value })
                        }
                        placeholder="https://"
                        className={`${FIELD_CLASS} mt-1`}
                      />
                    </div>
                    <div className="min-w-0">
                      <label
                        htmlFor={`channel-price-${def.key}`}
                        className={LABEL_CLASS}
                      >
                        価格（円）
                      </label>
                      <input
                        id={`channel-price-${def.key}`}
                        type="text"
                        inputMode="numeric"
                        value={draft.price}
                        disabled={savingChannel !== null}
                        onChange={(e) =>
                          updateDraft(def.key, { price: e.target.value })
                        }
                        placeholder="0"
                        className={`${FIELD_CLASS} mt-1 text-right`}
                      />
                    </div>
                  </div>

                  <div className="mt-2 min-w-0">
                    <label
                      htmlFor={`channel-note-${def.key}`}
                      className={LABEL_CLASS}
                    >
                      メモ
                    </label>
                    <input
                      id={`channel-note-${def.key}`}
                      type="text"
                      value={draft.note}
                      disabled={savingChannel !== null}
                      onChange={(e) =>
                        updateDraft(def.key, { note: e.target.value })
                      }
                      placeholder="任意"
                      className={`${FIELD_CLASS} mt-1`}
                    />
                  </div>

                  {message && (
                    <p
                      className={`mt-1.5 break-words text-[11px] leading-relaxed ${
                        message.type === "error"
                          ? "text-amber-800"
                          : "text-primary-700"
                      }`}
                    >
                      {message.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-2.5 text-[10.5px] leading-relaxed text-foreground-400">
            状態・価格・URL・メモは送信した項目だけが更新されます。空欄で保存すると
            その項目はクリアされます。
          </p>
        </>
      )}
    </section>
  );
}
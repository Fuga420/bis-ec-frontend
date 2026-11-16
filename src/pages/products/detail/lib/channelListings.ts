import { PRODUCTS_READ_API_URL } from "@/config/productsApi";
import { getAdminReadHeaders, notifyAdminUnauthorized } from "@/lib/adminAuth";
import { getBackendWriteAuthHeaders } from "@/lib/supabaseClient";

/**
 * 商品の出品チャネル（Mercari Shops / eBay / スニーカーダンク）の状態API接続。
 *
 * - 取得: GET /products/:id/channel-listings … 管理読み取り認証（X-Admin-Password）
 * - 更新: PUT /products/:id/channel-listings/:channel … 既存の書込認証（部分更新）
 *
 * 応答の形（配列・チャネル名キーのオブジェクト・data 配下の入れ子）の揺れを吸収して
 * 画面が使う形に正規化する。表示・編集のみで、商品データ側は変更しない。
 */

export type ChannelKey = "mercari_shops" | "ebay" | "snkrdunk";

export type ChannelListingStatus =
  | "not_listed"
  | "listed"
  | "sold"
  | "delisted";

export interface ChannelListing {
  channel: ChannelKey;
  status: ChannelListingStatus;
  listing_url: string | null;
  external_id: string | null;
  price_jpy: number | null;
  listed_at: string | null;
  sold_at: string | null;
  note: string | null;
}

export const CHANNEL_DEFINITIONS: Array<{
  key: ChannelKey;
  label: string;
}> = [
  { key: "mercari_shops", label: "Mercari Shops" },
  { key: "ebay", label: "eBay" },
  { key: "snkrdunk", label: "スニーカーダンク" },
];

export const CHANNEL_STATUS_LABELS: Record<ChannelListingStatus, string> = {
  not_listed: "未出品",
  listed: "出品中",
  sold: "売却済み",
  delisted: "取り下げ済み",
};

export const CHANNEL_STATUS_OPTIONS: ChannelListingStatus[] = [
  "not_listed",
  "listed",
  "sold",
  "delisted",
];

const CHANNEL_KEYS: ChannelKey[] = CHANNEL_DEFINITIONS.map((def) => def.key);

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickText(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toChannelKey(value: string): ChannelKey | null {
  const normalized = value.trim().toLowerCase();
  return (CHANNEL_KEYS as string[]).includes(normalized)
    ? (normalized as ChannelKey)
    : null;
}

function toStatus(value: string): ChannelListingStatus {
  const normalized = value.trim().toLowerCase();
  return (CHANNEL_STATUS_OPTIONS as string[]).includes(normalized)
    ? (normalized as ChannelListingStatus)
    : "not_listed";
}

export function emptyChannelListing(channel: ChannelKey): ChannelListing {
  return {
    channel,
    status: "not_listed",
    listing_url: null,
    external_id: null,
    price_jpy: null,
    listed_at: null,
    sold_at: null,
    note: null,
  };
}

function normalizeListing(
  channel: ChannelKey,
  entry: unknown
): ChannelListing {
  const obj = asObject(entry) ?? {};
  return {
    channel,
    status: toStatus(asString(obj.status)),
    listing_url: pickText(obj.listing_url ?? obj.url),
    external_id: pickText(obj.external_id ?? obj.listing_id),
    price_jpy: pickNumber(obj.price_jpy ?? obj.price),
    listed_at: pickText(obj.listed_at),
    sold_at: pickText(obj.sold_at),
    note: pickText(obj.note ?? obj.memo),
  };
}

/**
 * channel_listings を3チャネル分の配列に正規化する。
 * 配列形式・チャネル名キーのオブジェクト形式のどちらも受け付ける。
 * 応答に含まれないチャネルは「未出品」の既定値で補う。
 */
export function normalizeChannelListings(
  value: unknown
): ChannelListing[] {
  const byChannel = new Map<ChannelKey, ChannelListing>();

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      const obj = asObject(entry);
      if (!obj) return;
      const channel = toChannelKey(
        asString(obj.channel ?? obj.channel_key ?? obj.key)
      );
      if (!channel) return;
      byChannel.set(channel, normalizeListing(channel, obj));
    });
  } else {
    const obj = asObject(value);
    if (obj) {
      Object.keys(obj).forEach((key) => {
        const channel = toChannelKey(key);
        if (!channel) return;
        byChannel.set(channel, normalizeListing(channel, obj[key]));
      });
    }
  }

  return CHANNEL_DEFINITIONS.map(
    (def) => byChannel.get(def.key) ?? emptyChannelListing(def.key)
  );
}

/** delist_targets をチャネルキーの配列に正規化する（文字列・オブジェクト両対応）。 */
export function normalizeDelistTargets(value: unknown): ChannelKey[] {
  if (!Array.isArray(value)) return [];
  const result: ChannelKey[] = [];
  value.forEach((entry) => {
    const raw =
      typeof entry === "string"
        ? entry
        : asString((asObject(entry) ?? {}).channel);
    const channel = toChannelKey(raw);
    if (channel && !result.includes(channel)) result.push(channel);
  });
  return result;
}

function extractMessage(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const direct = asString(data.message ?? data.error ?? data.detail).trim();
  if (direct) return direct;
  const meta = asObject(data.meta);
  if (meta) {
    const nested = asString(meta.message ?? meta.detail).trim();
    if (nested) return nested;
  }
  return "";
}

/** 応答本体（入れ子の data を含む）から、対象の項目を持つオブジェクトを探す。 */
function pickPayload(
  data: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!data) return null;
  const candidates = [data, asObject(data.data), asObject(data.result)].filter(
    (entry): entry is Record<string, unknown> => entry !== null
  );
  const found = candidates.find(
    (entry) =>
      entry.channel_listings !== undefined ||
      entry.channelListings !== undefined
  );
  return found ?? candidates[0] ?? null;
}

async function parseJsonObject(
  response: Response
): Promise<Record<string, unknown> | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    return asObject(JSON.parse(text));
  } catch {
    return null;
  }
}

export interface ChannelListingsResult {
  listings: ChannelListing[];
  delistTargets: ChannelKey[];
}

function buildResult(data: Record<string, unknown> | null): ChannelListingsResult {
  const payload = pickPayload(data);
  return {
    listings: normalizeChannelListings(
      payload?.channel_listings ?? payload?.channelListings
    ),
    delistTargets: normalizeDelistTargets(
      payload?.delist_targets ?? payload?.delistTargets
    ),
  };
}

const endpoint = (productId: string): string =>
  `${PRODUCTS_READ_API_URL}/products/${encodeURIComponent(
    productId
  )}/channel-listings`;

/** 出品チャネルの取得（読み取り）。失敗を成功扱いにせず例外にする。 */
export async function fetchChannelListings(
  productId: string
): Promise<ChannelListingsResult> {
  const response = await fetch(endpoint(productId), {
    method: "GET",
    headers: { ...getAdminReadHeaders() },
  });
  if (response.status === 401) notifyAdminUnauthorized();

  const data = await parseJsonObject(response);
  const message = extractMessage(data);

  if (!response.ok) {
    throw new Error(
      message || `出品チャネルを取得できませんでした (HTTP ${response.status})。`
    );
  }
  if (data && data.success === false) {
    throw new Error(message || "出品チャネルを取得できませんでした。");
  }
  return buildResult(data);
}

/** 1チャネル分の部分更新（送った項目だけ更新。null はクリア）。 */
export interface ChannelListingPatch {
  status: ChannelListingStatus;
  listing_url: string | null;
  price_jpy: number | null;
  note: string | null;
}

export async function updateChannelListing(
  productId: string,
  channel: ChannelKey,
  patch: ChannelListingPatch
): Promise<ChannelListingsResult> {
  const authHeaders = await getBackendWriteAuthHeaders();
  const response = await fetch(
    `${endpoint(productId)}/${encodeURIComponent(channel)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders,
      },
      body: JSON.stringify(patch),
    }
  );
  if (response.status === 401) notifyAdminUnauthorized();

  const data = await parseJsonObject(response);
  const message = extractMessage(data);

  if (!response.ok) {
    throw new Error(
      message || `出品チャネルの保存に失敗しました (HTTP ${response.status})。`
    );
  }
  if (!data || data.success === false) {
    throw new Error(message || "出品チャネルの保存に失敗しました。");
  }
  return buildResult(data);
}
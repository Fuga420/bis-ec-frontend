export interface TaggedDescriptionField {
  label: string;
  values: string[];
}

export interface ParsedDescription {
  // 商品説明の本文（項目として抜き出した行を除いた残り）
  lead: string;
  // 【状態】【付属品】【サイズ】など、本文から抜き出した項目
  fields: TaggedDescriptionField[];
  // 本文中の #タグ（文章ではなくラベルとして扱うため、本文からは取り除く）
  hashtags: string[];
}

// 【ラベル】形式の見出しを拾う。長すぎる括弧は本文の装飾とみなして拾わない。
const TAG_PATTERN = /【([^】\n]{1,16})】/g;

// 「状態：美品」のように行頭でラベルを書いている説明文も項目として拾う。
const KNOWN_LABELS = [
  "商品状態",
  "コンディション",
  "状態",
  "付属品",
  "サイズ",
  "箱",
  "カラー",
  "素材",
  "型番",
  "年式",
  "ブランド",
  "モデル",
];
const LINE_FIELD_PATTERN = new RegExp(
  `^(${KNOWN_LABELS.join("|")})\\s*[:：]\\s*(.+)$`
);

// #タグ / ＃タグ（全角）を拾う。URL の # 断片は拾わない（直前が英数字の場合を除外）。
const HASHTAG_PATTERN = /[#＃][^\s#＃、,，。."'’”]+/gu;

/**
 * 本文からハッシュタグを取り除き、タグだけを配列で返す。
 * タグだけの行は本文から丸ごと落とし、文章の途中のタグは語ごとに削除する。
 */
function extractHashtags(text: string): { rest: string; tags: string[] } {
  const tags: string[] = [];
  const restLines: string[] = [];

  text.split("\n").forEach((line) => {
    const found = line.match(HASHTAG_PATTERN) ?? [];
    found.forEach((tag) => {
      const normalized = tag.replace(/^[＃]/, "#").trim();
      if (normalized.length > 1 && !tags.includes(normalized)) {
        tags.push(normalized);
      }
    });
    // タグを除いた残りが空の行は、本文に残さない
    const cleaned = line
      .replace(HASHTAG_PATTERN, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (cleaned) restLines.push(cleaned);
  });

  return { rest: restLines.join("\n"), tags };
}

function splitValues(block: string): string[] {
  return block
    .split(/[、,，\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function mergeFields(
  target: Map<string, string[]>,
  label: string,
  values: string[]
) {
  if (!label || values.length === 0) return;
  const current = target.get(label) ?? [];
  values.forEach((value) => {
    if (!current.includes(value)) current.push(value);
  });
  target.set(label, current);
}

/**
 * 商品説明の自由文から 【状態】【付属品】【サイズ】 のような項目を抜き出し、
 * 残りの文章だけを本文として返す（表示専用・保存データは変更しない）。
 *
 * 例: "希少モデルです。\n【状態】目立った傷なし\n【サイズ】27.5cm"
 *   -> lead: "希少モデルです。"
 *      fields: [{状態: ["目立った傷なし"]}, {サイズ: ["27.5cm"]}]
 *
 * 【】が無くても「状態：美品」のような行があれば項目として抜き出す。
 * どちらも無い説明文は、そのまま全文を本文として返す。
 */
export function parseTaggedDescription(text: string): ParsedDescription {
  const raw = (text ?? "").trim();
  if (!raw) return { lead: "", fields: [], hashtags: [] };

  const merged = new Map<string, string[]>();
  const matches = Array.from(raw.matchAll(TAG_PATTERN));

  let body = raw;
  if (matches.length > 0) {
    body = raw.slice(0, matches[0].index ?? 0).trim();
    matches.forEach((match, index) => {
      const label = (match[1] ?? "").trim();
      const start = (match.index ?? 0) + match[0].length;
      const nextIndex =
        index + 1 < matches.length
          ? (matches[index + 1].index ?? raw.length)
          : raw.length;
      mergeFields(merged, label, splitValues(raw.slice(start, nextIndex)));
    });
  }

  // 残った本文から「ラベル：値」の行を項目として抜き出す
  const rest: string[] = [];
  body.split("\n").forEach((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(LINE_FIELD_PATTERN);
    if (match) {
      mergeFields(merged, (match[1] ?? "").trim(), splitValues(match[2] ?? ""));
      return;
    }
    rest.push(line);
  });

  const fields: TaggedDescriptionField[] = Array.from(merged.entries()).map(
    ([label, values]) => ({ label, values })
  );

  // 残った本文からハッシュタグを抜き出し、本文には文章だけを残す
  const { rest: bodyWithoutTags, tags: hashtags } = extractHashtags(
    rest.join("\n")
  );

  return { lead: bodyWithoutTags.trim(), fields, hashtags };
}
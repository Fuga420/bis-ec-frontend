import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

// documents-relay の配信内容を「実リクエストの応答」で判定する一時的な検証画面。
// バックエンド未対応の action は UNSUPPORTED_ACTION(400) を返す仕様なので、
// 応答コードを見れば旧版 / 新版のどちらが動いているか確定できる。

const RELAY_FUNCTION = "documents-relay";
const AUTO_LINK_ACTION = "auto_link_product_by_item_number";

type RelayCallResult = {
  httpStatus: number | null;
  body: string;
  transportOk: boolean;
};

type Panel = {
  title: string;
  description: string;
  result: RelayCallResult | null;
  error: string | null;
};

const EMPTY_PANEL: Panel = {
  title: "",
  description: "",
  result: null,
  error: null,
};

async function callRelay(payload: Record<string, unknown>): Promise<RelayCallResult> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("バックエンドに接続されていません（設定値が見つかりません）。");
  }

  const { data, error } = await client.functions.invoke(RELAY_FUNCTION, {
    body: payload,
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    let httpStatus: number | null = null;
    let body = error.message || "応答本文を取得できませんでした。";
    if (context) {
      httpStatus = context.status;
      try {
        body = await context.text();
      } catch {
        // 本文が読めない場合は error.message をそのまま使う
      }
    }
    return { httpStatus, body, transportOk: false };
  }

  return {
    httpStatus: 200,
    body: JSON.stringify(data ?? {}, null, 2),
    transportOk: true,
  };
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default function RelayCheckPage() {
  const [productId, setProductId] = useState("TMP-000161");
  const [auctionItemNumber, setAuctionItemNumber] = useState("842-33225");
  const [useDryRun, setUseDryRun] = useState(false);

  const [pingPanel, setPingPanel] = useState<Panel>(EMPTY_PANEL);
  const [autoLinkPanel, setAutoLinkPanel] = useState<Panel>(EMPTY_PANEL);
  const [busy, setBusy] = useState<"" | "ping" | "autolink">("");

  const runPing = async () => {
    setBusy("ping");
    setPingPanel({ ...EMPTY_PANEL, title: "実行中…", description: "" });
    try {
      const result = await callRelay({
        action: "get_product_cost",
        product_id: "TMP-000134",
      });
      setPingPanel({
        title: "疎通確認（読み取り専用）",
        description: "get_product_cost を TMP-000134 で呼び出し、中継自体が生きているか確認します。",
        result,
        error: null,
      });
    } catch (e: unknown) {
      setPingPanel({
        title: "疎通確認（読み取り専用）",
        description: "",
        result: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy("");
    }
  };

  const runAutoLink = async () => {
    setBusy("autolink");
    setAutoLinkPanel({ ...EMPTY_PANEL, title: "実行中…", description: "" });
    const payload: Record<string, unknown> = {
      action: AUTO_LINK_ACTION,
      product_id: productId.trim(),
      auction_item_number: auctionItemNumber.trim(),
    };
    if (useDryRun) payload.dry_run = true;
    try {
      const result = await callRelay(payload);
      setAutoLinkPanel({
        title: "自動照合 action の実リクエスト",
        description: `送信内容: ${JSON.stringify(payload)}`,
        result,
        error: null,
      });
    } catch (e: unknown) {
      setAutoLinkPanel({
        title: "自動照合 action の実リクエスト",
        description: "",
        result: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy("");
    }
  };

  const autoLinkBody = autoLinkPanel.result?.body ?? "";
  const isUnsupported = autoLinkBody.includes("UNSUPPORTED_ACTION");
  const verdict = autoLinkBody
    ? isUnsupported
      ? "旧版（この action 未実装）"
      : "新版（この action を受け付けている）"
    : "";

  return (
    <div className="min-h-screen w-full bg-background-50 px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8">
          <p className="mb-2 font-label text-xs uppercase tracking-[0.2em] text-secondary-700">
            Diagnostic
          </p>
          <h1 className="font-heading text-2xl font-semibold text-foreground-950 md:text-3xl">
            documents-relay 配信内容チェック
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-700">
            バックエンドのエディタでコードが見つからなかったため、実際にリクエストを送って
            <span className="font-medium text-foreground-900"> 旧版 / 新版を判定 </span>
            します。応答の生データをそのまま表示します。
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-background-200 bg-background-100 p-5 md:p-6">
          <h2 className="mb-1 font-heading text-base font-semibold text-foreground-950">
            1. 中継の疎通確認
          </h2>
          <p className="mb-4 text-sm text-foreground-700">
            まず中継自体が動いているかを、既存の読み取りアクションで確認します。
          </p>
          <button
            type="button"
            onClick={runPing}
            disabled={busy !== ""}
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-secondary-500 px-5 py-2.5 font-label text-sm font-medium text-background-50 transition hover:bg-secondary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <i className="ri-pulse-line text-base"></i>
            </span>
            get_product_cost を実行
          </button>
          <PanelView panel={pingPanel} />
        </section>

        <section className="mb-6 rounded-2xl border border-background-200 bg-background-100 p-5 md:p-6">
          <h2 className="mb-1 font-heading text-base font-semibold text-foreground-950">
            2. auto_link_product_by_item_number の判定
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-foreground-700">
            <span className="font-medium text-accent-900">注意:</span>{" "}
            新版が動いている場合、このリクエストは実際にリンク状態を評価します。
            期待される結果は
            <code className="mx-1 rounded bg-background-200 px-1.5 py-0.5 font-mono text-xs">
              conflict_existing_link
            </code>
            で、TMP-000134 のリンクは維持されるはずです。
          </p>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="font-label text-xs text-foreground-700">product_id</span>
              <input
                type="text"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="box-border w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="font-label text-xs text-foreground-700">
                auction_item_number
              </span>
              <input
                type="text"
                value={auctionItemNumber}
                onChange={(e) => setAuctionItemNumber(e.target.value)}
                className="box-border w-full rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500"
              />
            </label>
          </div>

          <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground-800">
            <input
              type="checkbox"
              checked={useDryRun}
              onChange={(e) => setUseDryRun(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary-500"
            />
            dry_run: true を付ける（新版が対応していれば書き込みなし）
          </label>

          <button
            type="button"
            onClick={runAutoLink}
            disabled={busy !== ""}
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-primary-500 px-5 py-2.5 font-label text-sm font-medium text-background-50 transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <i className="ri-send-plane-line text-base"></i>
            </span>
            実リクエストを送信
          </button>

          {verdict ? (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                isUnsupported
                  ? "border-accent-200 bg-accent-100 text-accent-900"
                  : "border-primary-200 bg-primary-100 text-primary-900"
              }`}
            >
              判定: {verdict}
            </div>
          ) : null}

          <PanelView panel={autoLinkPanel} />
        </section>

        <p className="text-xs leading-relaxed text-foreground-600">
          この画面は確認用です。判定が終わったら削除します。
        </p>
      </div>
    </div>
  );
}

function PanelView({ panel }: { panel: Panel }) {
  if (!panel.result && !panel.error) return null;

  const status = panel.result?.httpStatus;
  const isErrorStatus = status !== null && status !== undefined && status >= 400;

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-label text-xs font-medium text-foreground-900">
          {panel.title}
        </span>
        {status !== null && status !== undefined ? (
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${
              isErrorStatus
                ? "bg-accent-100 text-accent-900"
                : "bg-primary-100 text-primary-900"
            }`}
          >
            HTTP {status}
          </span>
        ) : null}
      </div>
      {panel.description ? (
        <p className="mb-2 break-all text-xs text-foreground-600">{panel.description}</p>
      ) : null}
      {panel.error ? (
        <div className="rounded-lg border border-accent-200 bg-accent-100 px-3 py-2 text-xs text-accent-900">
          {panel.error}
        </div>
      ) : null}
      {panel.result ? (
        <pre className="max-h-80 overflow-auto rounded-lg border border-background-300 bg-foreground-950 px-3 py-3 font-mono text-xs leading-relaxed text-background-50">
          {formatBody(panel.result.body)}
        </pre>
      ) : null}
    </div>
  );
}
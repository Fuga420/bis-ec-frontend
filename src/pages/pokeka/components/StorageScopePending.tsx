/**
 * 「現行」サブタブの受け皿。
 *
 * 現行ストレージの判定ルールが未確定のため、一覧・ダミーデータは表示しない。
 * 分類条件が決まったら storageScopes.ts の対象判定に追加し、この表示は差し替える。
 * 装飾アイコン・色付き背景は使わず、文字と余白だけで状態を伝える。
 */
export default function StorageScopePending() {
  return (
    <div className="ui-card rounded-lg px-5 py-10">
      <p className="text-sm font-medium text-foreground-800">
        現行ストレージの分類条件は準備中です
      </p>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-foreground-500">
        現行ストレージの該当判定方法が決まっていないため、この区分では一覧を表示していません。
        旧裏以外の商品を現行として自動分類することはせず、仮の商品データも表示しません。
        分類条件が決まり次第、この区分に旧裏と同じ一覧・絞り込みを追加します。
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-foreground-400">
        現在分類できるのは「旧裏」の商品（保管場所が「旧裏ストレージ/」で始まる商品）だけです。
      </p>
    </div>
  );
}
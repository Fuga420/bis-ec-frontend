/**
 * 「現行」サブタブの受け皿。
 *
 * 現行ストレージの判定ルールが未確定のため、一覧・ダミーデータは表示しない。
 * 分類条件が決まったら storageScopes.ts の対象判定に追加し、この表示は差し替える。
 * 判定条件（保管場所の内部ルール）は通常画面に出さず、状態だけを文字で示す。
 */
export default function StorageScopePending() {
  return (
    <div className="ui-card rounded-lg px-5 py-10">
      <p className="text-sm font-medium text-foreground-800">
        現行ストレージの分類条件は準備中です
      </p>
    </div>
  );
}
# 商品吸い込み口（商品登録アプリ）

## プロジェクト概要

このアプリは、社内スタッフがスニーカー・ジュエリー等の商品を1つの共通画面から登録するための「商品吸い込み口」のMVPです。

大量の商品在庫を効率的にデータ化・整理することを目的としています。

一般顧客向けECサイトではなく、社内業務用の商品登録アプリです。

## 現在のバージョン

`v0.5`

現在のv0.5はE2E動作確認済みです。

## 現在実装済みの機能

- 商品画像アップロード
- 最大10枚の画像登録
- JPG / JPEG / PNG / WEBP対応
- スニーカー / ジュエリー / その他のカテゴリ選択
- カテゴリに応じた動的フォーム
- 共通商品情報入力
- スニーカー固有情報入力
- ジュエリー固有情報入力
- 入力バリデーション
- 登録中表示
- 通信失敗時のフォーム保持
- Google Apps Scriptへの商品データ送信
- Google Sheetsへの商品情報保存
- 商品IDの自動発行
- Google Driveへの商品ID別フォルダ自動作成
- Google Driveへの商品画像保存
- 1枚目をメイン画像として保存
- 登録成功時の商品ID表示
- GitHubによるコード管理

## 現在のデータフロー

```text
商品登録画面（Readdy / React）
        ↓
商品情報 + 商品画像
        ↓
Google Apps Script Web App
        │
        ├── 商品ID発行
        │
        ├── Google Sheets
        │      └── 商品情報を1商品1行で保存
        │
        └── Google Drive
               └── 商品IDごとのフォルダを作成
                    ├── 01_main_xxx.jpg
                    ├── 02_xxx.jpg
                    └── ...
```

## データ保存方針

現在のMVPでは、

- 商品情報 → Google Sheets
- 商品画像 → Google Drive

に保存します。

Google Sheets上の商品IDとGoogle Drive上の商品フォルダ名を同一にすることで紐付けています。

Google Driveには商品画像等のファイルを保存し、Google Sheetsには商品情報とDrive参照URLを保存します。

## 技術構成

実際に使用している技術のみ記載します。

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router（react-router-dom）
- i18next / react-i18next（国際化）
- Readdy
- Google Apps Script
- Google Sheets
- Google Drive
- Git / GitHub

補足：`package.json` には `firebase`・`@supabase/supabase-js`・`@stripe/react-stripe-js`・`recharts`・`lucide-react` が依存関係として含まれていますが、現在のコードでは使用していません。

## ディレクトリ構成

主要ファイルのみ記載します。

```text
src/
├── config/
│   └── googleSheets.ts          # Google Apps Script Web App のエンドポイントURLを定義
├── mocks/
│   └── productForm.ts           # カテゴリ・ブランド・サイズ・状態などの選択肢データと型定義
├── pages/
│   └── register/
│       ├── page.tsx             # 商品登録画面の本体（状態管理・バリデーション・POST送信）
│       └── components/
│           ├── FormField.tsx    # ラベル付き入力欄の共通コンポーネント
│           ├── ImageUpload.tsx  # 画像アップロード（複数選択・プレビュー・メイン指定・削除）
│           ├── SneakerFields.tsx# スニーカー固有の入力項目
│           └── JewelryFields.tsx# ジュエリー固有の入力項目
└── router/
    └── config.tsx               # ルーティング定義（`/` に商品登録画面を割当）
```

各ファイルの担当：

- `src/pages/register/page.tsx` — 商品登録画面のエントリ。入力状態の管理、バリデーション、画像のBase64変換、Google Apps Script への POST 送信を担当。
- `src/pages/register/components/ImageUpload.tsx` — 商品画像の選択（最大10枚）・プレビュー・削除・メイン画像指定を担当。`File` オブジェクトを保持する。
- `src/pages/register/components/SneakerFields.tsx` — スニーカーカテゴリ選択時に表示する固有入力項目（SKU・サイズ・カラー等）を担当。
- `src/pages/register/components/JewelryFields.tsx` — ジュエリーカテゴリ選択時に表示する固有入力項目（種類・素材・4C等）を担当。
- `src/config/googleSheets.ts` — Google Apps Script Web App のエンドポイントURLを定義する設定ファイル。
- `src/mocks/productForm.ts` — カテゴリ・ブランド・サイズ・状態・付属品などの選択肢データと型定義（商品フォーム用データ・設定ファイル）。

## 開発方法

```bash
npm install
npm run dev
npm run build
```

その他の利用可能なコマンド：

```bash
npm run preview     # ビルド結果のローカルプレビュー
npm run lint        # ESLint によるコードチェック
npm run type-check  # TypeScript の型チェック
```

## セキュリティ上の注意

- APIキー、パスワード、Service Account秘密鍵等をGitHubにコミットしない
- `.env` 系ファイルをGit管理しない
- Google Apps Script Web App URLは現在MVP用であり、本番運用時には認証・アクセス制御を検討する
- 顧客情報や機密情報をソースコードへ直接記述しない

> Google Apps Script の実URLや Google Drive の具体的なフォルダIDは本READMEには記載していません。構成のみを説明しています。

## 現在未実装の機能（Future / TODO）

以下は「予定」であり、現在は未実装です。

- Geminiによる商品画像解析
- AIによる商品情報自動入力
- 商品一覧画面
- 商品検索
- 商品編集
- 在庫ステータス管理
- Curry Kicksサイトとの商品データ連携
- ジュエリーサイトとの商品データ連携
- 共通商品DB
- ログイン / 認証
- 権限管理
- 本番向けAPI認証
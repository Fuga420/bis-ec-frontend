# ==============================================================================
# Cloud Run Jobs Dockerfile
# B.I.S EC 仕入書類 Google Drive 自動一括取込ワーカー (Node.js)
# ==============================================================================

FROM node:20-slim AS runner

WORKDIR /app

# 日本語ロケール / タイムゾーン (JST) 設定
ENV TZ=Asia/Tokyo
ENV NODE_ENV=production

# 依存パッケージ定義のコピー
COPY package.json package-lock.json ./

# 本番依存パッケージのインストール (キャッシュ最適化)
RUN npm ci --omit=dev

# アプリケーションスクリプト・パーサーのコピー
# アプリケーションスクリプト・パーサーのコピー (実行に必要なファイルに限定)
COPY scripts/drive_auto_import_worker.mjs ./scripts/
COPY scripts/parsers/ ./scripts/parsers/

# コンテナ実行ユーザー (セキュリティベストプラクティス)
USER node

# Cloud Run Jobs エントリポイント
# ジョブ起動時に drive_auto_import_worker.mjs を実行し、全件処理後に exit code 0 で正常終了する
ENTRYPOINT ["node", "scripts/drive_auto_import_worker.mjs"]


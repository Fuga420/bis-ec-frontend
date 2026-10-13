const crypto = require('node:crypto');

let functions;
try {
  functions = require('@google-cloud/functions-framework');
} catch (_) {
  // functions-framework がインストールされていない環境（単体テスト等）でも動作可能
}

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 環境変数の検証と正規化
 * @param {Object} env
 * @return {{
 *   gasWebhookUrl: string,
 *   gasAdminSecret: string,
 *   allowedOrigins: string[],
 *   jwtSecret: string,
 *   jwtRequired: boolean,
 *   timeoutMs: number
 * }}
 */
function validateConfig(env = process.env) {
  const gasWebhookUrl = String(env.GAS_WEBHOOK_URL || '').trim();
  const gasAdminSecret = String(env.GAS_ADMIN_SECRET || '').trim();

  const missing = [];
  if (!gasWebhookUrl) missing.push('GAS_WEBHOOK_URL');
  if (!gasAdminSecret) missing.push('GAS_ADMIN_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!/^https?:\/\//i.test(gasWebhookUrl)) {
    throw new Error('GAS_WEBHOOK_URL must be a valid HTTP/HTTPS URL');
  }

  const rawOrigins = String(env.ALLOWED_ORIGINS || '*').trim();
  const allowedOrigins = rawOrigins === '*'
    ? ['*']
    : rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

  const jwtSecret = String(env.JWT_SECRET || '').trim();
  const jwtRequired = String(env.JWT_REQUIRED || '').toLowerCase() === 'true';

  let timeoutMs = parseInt(env.GAS_REQUEST_TIMEOUT_MS, 10);
  if (isNaN(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  return {
    gasWebhookUrl,
    gasAdminSecret,
    allowedOrigins,
    jwtSecret,
    jwtRequired,
    timeoutMs
  };
}

/**
 * HS256 JWT検証 (標準ライブラリ node:crypto 実装)
 * @param {string} token Bearerトークン文字列
 * @param {string} secret 署名シークレット
 * @return {{ valid: boolean, error?: string, payload?: Object }}
 */
function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is empty' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, error: 'Invalid JSON encoding in token' };
  }

  if (header.alg !== 'HS256') {
    return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
  }

  try {
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (err) {
    return { valid: false, error: 'Signature verification failure' };
  }

  if (payload.exp && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) {
      return { valid: false, error: 'Token expired' };
    }
  }

  return { valid: true, payload };
}

/**
 * CORSオリジンの照合とヘッダー設定
 * @param {Object} req
 * @param {Object} res
 * @param {Object} config
 * @return {boolean} オリジンが許可されたか
 */
function handleCors(req, res, config) {
  const origin = req.headers && req.headers['origin'];
  const isWildcard = config.allowedOrigins.includes('*');

  let allowOrigin = null;
  if (isWildcard) {
    allowOrigin = origin || '*';
  } else if (origin && config.allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
    return true;
  }

  // 許可オリジン指定があり、かつリクエストにOriginが存在し一致しない場合
  if (origin && !isWildcard) {
    return false;
  }

  // Same-originやサーバー間呼び出し（Originヘッダーなし）は許可
  return true;
}

/**
 * リクエストボディの正規化パース
 * @param {Object} req
 * @return {Object}
 */
function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString('utf8')
    : (typeof req.body === 'string' ? req.body : '');
  if (!raw || !raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

/**
 * バッチ中継ハンドラー生成関数 (テスト用に fetchFn / getEnv を注入可能)
 */
function createBatchRelayHandler({
  fetchFn = globalThis.fetch,
  getEnv = () => process.env
} = {}) {
  return async function gasAiBatchRelay(req, res) {
    // 1. 環境設定の検証
    let config;
    try {
      config = validateConfig(getEnv());
    } catch (err) {
      console.error('[BatchRelay] Configuration error:', err.message);
      return res.status(500).json({
        success: false,
        error_code: 'SERVER_CONFIGURATION_ERROR',
        message: 'Server configuration error'
      });
    }

    // 2. CORSの検証とヘッダー適用
    const corsAllowed = handleCors(req, res, config);
    if (!corsAllowed) {
      console.warn('[BatchRelay] CORS origin rejected:', req.headers['origin']);
      return res.status(403).json({
        success: false,
        error_code: 'ORIGIN_NOT_ALLOWED',
        message: 'Origin not allowed by CORS policy'
      });
    }

    // 3. OPTIONS プリフライト応答
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // 4. HTTP メソッド制限 (GET, POST のみ)
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({
        success: false,
        error_code: 'METHOD_NOT_ALLOWED',
        message: `HTTP Method ${req.method} is not allowed`
      });
    }

    // 5. JWT認証 / 呼び出し元検証
    const authHeader = String(req.headers['authorization'] || '').trim();
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch ? bearerMatch[1].trim() : '';

    if (config.jwtRequired && !token) {
      console.warn('[BatchRelay] Unauthorized: Authorization Bearer token is required');
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Authorization Bearer token is required'
      });
    }

    if (config.jwtSecret && token) {
      const jwtResult = verifyJwt(token, config.jwtSecret);
      if (!jwtResult.valid) {
        console.warn('[BatchRelay] JWT validation failed:', jwtResult.error);
        return res.status(401).json({
          success: false,
          error_code: 'INVALID_TOKEN',
          message: `Authentication token rejected: ${jwtResult.error}`
        });
      }
    }

    // 6. アクション判定 (3アクションのみ受付)
    const query = req.query || {};
    const body = req.method === 'POST' ? parseRequestBody(req) : {};

    let action = String(body.action || query.action || '').trim();
    if (!action && req.method === 'GET' && query.batch_id) {
      action = 'get_ai_product_draft_batch';
    }

    const ALLOWED_ACTIONS = [
      'create_ai_product_draft_batch',
      'get_ai_product_draft_batch',
      'retry_ai_product_draft_batch'
    ];

    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({
        success: false,
        error_code: 'ACTION_NOT_SUPPORTED',
        message: `Action '${action}' is not supported. Allowed actions: ${ALLOWED_ACTIONS.join(', ')}`
      });
    }

    // 7. アクション別バリデーションおよび上流GAS転送ペイロード構築
    let upstreamUrl = config.gasWebhookUrl;
    let upstreamMethod = 'POST';
    let upstreamBody = null;

    if (action === 'create_ai_product_draft_batch') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({
          success: false,
          error_code: 'METHOD_NOT_ALLOWED',
          message: 'create_ai_product_draft_batch requires POST method'
        });
      }

      const requestId = String(body.request_id || '').trim();
      if (!requestId) {
        return res.status(400).json({
          success: false,
          error_code: 'REQUEST_ID_REQUIRED',
          message: 'request_id is required for batch creation'
        });
      }

      if (!Array.isArray(body.product_ids) || body.product_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error_code: 'EMPTY_PRODUCT_IDS',
          message: 'product_ids must be a non-empty array'
        });
      }

      if (body.product_ids.length > 20) {
        return res.status(400).json({
          success: false,
          error_code: 'MAX_BATCH_SIZE_EXCEEDED',
          message: 'product_ids cannot exceed 20 items'
        });
      }

      // クライアントからの管理キー上書きを防ぎ、サーバー側設定を注入
      upstreamBody = {
        action: 'create_ai_product_draft_batch',
        mode: 'admin',
        admin_key: config.gasAdminSecret,
        request_id: requestId,
        product_ids: body.product_ids.map(id => String(id).trim()).filter(Boolean),
        force_regenerate: Boolean(body.force_regenerate)
      };

      if (body.model_name && typeof body.model_name === 'string') {
        upstreamBody.model_name = body.model_name.trim();
      }
    } else if (action === 'get_ai_product_draft_batch') {
      const batchId = String(query.batch_id || body.batch_id || '').trim();
      if (!batchId) {
        return res.status(400).json({
          success: false,
          error_code: 'BATCH_ID_REQUIRED',
          message: 'batch_id is required'
        });
      }

      // 契約書に合わせ、GASへGET転送
      const separator = upstreamUrl.includes('?') ? '&' : '?';
      const qParams = new URLSearchParams({
        mode: 'admin',
        admin_key: config.gasAdminSecret,
        action: 'get_ai_product_draft_batch',
        batch_id: batchId
      });

      upstreamUrl = `${upstreamUrl}${separator}${qParams.toString()}`;
      upstreamMethod = 'GET';
      upstreamBody = null;
    } else if (action === 'retry_ai_product_draft_batch') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({
          success: false,
          error_code: 'METHOD_NOT_ALLOWED',
          message: 'retry_ai_product_draft_batch requires POST method'
        });
      }

      const batchId = String(body.batch_id || query.batch_id || '').trim();
      if (!batchId) {
        return res.status(400).json({
          success: false,
          error_code: 'BATCH_ID_REQUIRED',
          message: 'batch_id is required'
        });
      }

      const requestId = String(body.request_id || '').trim();
      if (!requestId) {
        return res.status(400).json({
          success: false,
          error_code: 'REQUEST_ID_REQUIRED',
          message: 'request_id is required for retry'
        });
      }

      upstreamBody = {
        action: 'retry_ai_product_draft_batch',
        mode: 'admin',
        admin_key: config.gasAdminSecret,
        batch_id: batchId,
        request_id: requestId
      };
    }

    // 8. 上流 GAS へのリレー実行
    try {
      const fetchOptions = {
        method: upstreamMethod,
        headers: {
          'Accept': 'application/json'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(config.timeoutMs)
      };

      if (upstreamBody) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(upstreamBody);
      }

      const gasResponse = await fetchFn(upstreamUrl, fetchOptions);
      const responseText = await gasResponse.text();

      let jsonOutput;
      try {
        jsonOutput = JSON.parse(responseText);
      } catch (_) {
        console.error('[BatchRelay] Upstream GAS returned non-JSON:', responseText.substring(0, 300));
        return res.status(502).json({
          success: false,
          error_code: 'GAS_INVALID_RESPONSE',
          message: 'Upstream GAS returned an invalid response format'
        });
      }

      const statusCode = gasResponse.status >= 200 && gasResponse.status < 300 ? 200 : gasResponse.status;
      return res.status(statusCode).json(jsonOutput);

    } catch (err) {
      if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
        console.error('[BatchRelay] Upstream GAS timeout after', config.timeoutMs, 'ms');
        return res.status(504).json({
          success: false,
          error_code: 'GAS_TIMEOUT',
          message: `Upstream GAS timed out after ${config.timeoutMs}ms`
        });
      }

      console.error('[BatchRelay] Upstream connection failure:', err.message);
      return res.status(502).json({
        success: false,
        error_code: 'GAS_UPSTREAM_ERROR',
        message: 'Failed to communicate with GAS upstream'
      });
    }
  };
}

// Functions Framework にハンドラーを登録 (Cloud Run functions デプロイ用)
if (functions && typeof functions.http === 'function') {
  functions.http('gasAiBatchRelay', createBatchRelayHandler());
}

module.exports = {
  createBatchRelayHandler,
  validateConfig,
  verifyJwt,
  handleCors
};

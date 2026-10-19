import fs from "fs";

async function getGcpAccessTokenFromServiceAccount(saKeyJson) {
  const sa = JSON.parse(saKeyJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now - 30
  };

  const encodeBase64Url = (str) => {
    return Buffer.from(str).toString("base64url");
  };

  const headerB64 = encodeBase64Url(JSON.stringify(header));
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // PEM形式の private_key からバイナリ DER を抽出
  const pem = sa.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter)).replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(Buffer.from(pemContents, "base64"));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = Buffer.from(signatureBuffer).toString("base64url");
  const jwt = `${unsignedToken}.${signatureB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString()
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth2 トークン取得失敗: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

const keyJson = fs.readFileSync("sa_key.json", "utf8");
getGcpAccessTokenFromServiceAccount(keyJson)
  .then(token => console.log("WebCrypto SA Token Success! Length:", token.length))
  .catch(console.error);


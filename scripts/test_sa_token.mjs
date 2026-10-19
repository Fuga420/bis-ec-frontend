import fs from "fs";
import crypto from "crypto";

export async function getAccessTokenFromServiceAccount(keyFile) {
  const sa = JSON.parse(fs.readFileSync(keyFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now - 30
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${b64Header}.${b64Payload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = `${unsignedToken}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString()
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token error: ${JSON.stringify(data)}`);
  }
  return { token_type: data.token_type, expires_in: data.expires_in, has_token: !!data.access_token, access_token: data.access_token };
}

getAccessTokenFromServiceAccount("sa_key.json")
  .then(r => console.log("Token generation success:", { token_type: r.token_type, expires_in: r.expires_in, has_token: r.has_token }))
  .catch(console.error);


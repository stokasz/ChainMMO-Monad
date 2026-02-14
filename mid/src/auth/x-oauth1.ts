import crypto from "node:crypto";

export interface XOAuth1Client {
  requestToken(callbackUrl: string): Promise<{ oauthToken: string; oauthTokenSecret: string }>;
  accessToken(params: {
    oauthToken: string;
    oauthTokenSecret: string;
    oauthVerifier: string;
  }): Promise<{ userId: string; screenName: string }>;
}

export function createXOauth1Client(params: {
  consumerKey: string;
  consumerSecret: string;
  fetchImpl?: typeof fetch;
}): XOAuth1Client {
  const fetchImpl = params.fetchImpl ?? fetch;
  const consumerKey = params.consumerKey;
  const consumerSecret = params.consumerSecret;

  const requestToken = async (callbackUrl: string) => {
    const url = "https://api.twitter.com/oauth/request_token";
    const oauthParams = buildOAuthParams({
      consumerKey,
      extra: { oauth_callback: callbackUrl }
    });
    const signature = signOAuthRequest({
      method: "POST",
      url,
      params: oauthParams,
      consumerSecret,
      tokenSecret: ""
    });
    const authHeader = buildOAuthHeader({ ...oauthParams, oauth_signature: signature });

    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: authHeader
      }
    });
    if (!response.ok) {
      throw new Error(`x_request_token_failed:${response.status}`);
    }
    const body = await response.text();
    const parsed = parseFormEncoded(body);
    const oauthToken = parsed.oauth_token;
    const oauthTokenSecret = parsed.oauth_token_secret;
    if (typeof oauthToken !== "string" || typeof oauthTokenSecret !== "string") {
      throw new Error("x_request_token_malformed_response");
    }
    return { oauthToken, oauthTokenSecret };
  };

  const accessToken = async (input: { oauthToken: string; oauthTokenSecret: string; oauthVerifier: string }) => {
    const url = "https://api.twitter.com/oauth/access_token";
    const oauthParams = buildOAuthParams({
      consumerKey,
      token: input.oauthToken,
      extra: { oauth_verifier: input.oauthVerifier }
    });
    const signature = signOAuthRequest({
      method: "POST",
      url,
      params: oauthParams,
      consumerSecret,
      tokenSecret: input.oauthTokenSecret
    });
    const authHeader = buildOAuthHeader({ ...oauthParams, oauth_signature: signature });

    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: authHeader
      }
    });
    if (!response.ok) {
      throw new Error(`x_access_token_failed:${response.status}`);
    }
    const body = await response.text();
    const parsed = parseFormEncoded(body);
    const userId = parsed.user_id;
    const screenName = parsed.screen_name;
    if (typeof userId !== "string" || typeof screenName !== "string") {
      throw new Error("x_access_token_malformed_response");
    }
    return { userId, screenName };
  };

  return {
    requestToken,
    accessToken
  };
}

function buildOAuthParams(input: {
  consumerKey: string;
  token?: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  const now = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const out: Record<string, string> = {
    oauth_consumer_key: input.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: now,
    oauth_version: "1.0"
  };

  if (input.token) {
    out.oauth_token = input.token;
  }

  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      out[k] = v;
    }
  }

  return out;
}

function buildOAuthHeader(params: Record<string, string>): string {
  const oauthPairs = Object.entries(params)
    .filter(([k]) => k.startsWith("oauth_"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}=\"${percentEncode(v)}\"`);
  return `OAuth ${oauthPairs.join(", ")}`;
}

function signOAuthRequest(input: {
  method: "POST" | "GET";
  url: string;
  params: Record<string, string>;
  consumerSecret: string;
  tokenSecret: string;
}): string {
  const normalizedUrl = normalizeUrl(input.url);
  const normalizedParams = normalizeParams(input.params);
  const baseString = [
    input.method.toUpperCase(),
    percentEncode(normalizedUrl),
    percentEncode(normalizedParams)
  ].join("&");

  const key = `${percentEncode(input.consumerSecret)}&${percentEncode(input.tokenSecret)}`;
  const hmac = crypto.createHmac("sha1", key).update(baseString).digest("base64");
  return hmac;
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  const port = u.port;
  const isDefaultPort = (u.protocol === "https:" && port === "443") || (u.protocol === "http:" && port === "80");
  const host = isDefaultPort || port.length === 0 ? u.hostname : `${u.hostname}:${port}`;
  return `${u.protocol}//${host}${u.pathname}`;
}

function normalizeParams(params: Record<string, string>): string {
  const pairs = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
      return a[1].localeCompare(b[1]);
    });

  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

function percentEncode(value: string): string {
  // OAuth 1.0a uses RFC 3986 encoding rules.
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function parseFormEncoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split("&")) {
    if (!part) continue;
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      // Best-effort.
      out[k] = v;
    }
  }
  return out;
}


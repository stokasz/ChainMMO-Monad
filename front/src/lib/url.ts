export function getApiBase(): string {
  const raw = new URLSearchParams(window.location.search).get("api");
  const envBase = import.meta.env.VITE_API_BASE;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const defaultLocalApi = "http://127.0.0.1:8787";

  if (envBase && typeof envBase === "string" && envBase.trim()) {
    try {
      return new URL(envBase, window.location.origin).toString().replace(/\/$/, "");
    } catch {
      // Ignore invalid env value and continue through normal detection.
    }
  }

  // Allow localhost/dev overrides but keep it as a normal URL.
  if (raw) {
    if (isLocalHost && raw.trim() === "/") {
      return defaultLocalApi;
    }
    try {
      return new URL(raw, window.location.origin).toString().replace(/\/$/, "");
    } catch {
      // fall through to environment heuristics below
    }
  }

  // If running local frontend against a local middleware, prefer direct API URL.
  // This preserves same-origin behavior when served from production API/CDN.
  if (isLocalHost) {
    return defaultLocalApi;
  }
  return window.location.origin;
}

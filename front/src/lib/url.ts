export function getApiBase(): string {
  const raw = new URLSearchParams(window.location.search).get("api");
  if (!raw) return window.location.origin;

  // Allow localhost/dev overrides but keep it as a normal URL.
  try {
    return new URL(raw, window.location.origin).toString().replace(/\/$/, "");
  } catch {
    return window.location.origin;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as unknown;
        if (data && typeof data === "object") {
          const record = data as Record<string, unknown>;
          const error = typeof record.error === "string" ? record.error : "";
          const reason = typeof record.reason === "string" ? record.reason : "";
          detail = [error, reason].filter(Boolean).join(": ");
          if (!detail) {
            detail = JSON.stringify(data);
          }
        } else if (typeof data === "string") {
          detail = data;
        }
      } else {
        detail = (await response.text()).trim();
      }
    } catch {
      // Ignore error body parsing.
    }
    if (detail) {
      throw new Error(`http_${response.status}: ${detail}`);
    }
    throw new Error(`http_${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new Error("malformed_json", { cause: err });
  }
}

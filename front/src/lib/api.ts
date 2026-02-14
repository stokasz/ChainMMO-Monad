export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new Error("malformed_json", { cause: err });
  }
}

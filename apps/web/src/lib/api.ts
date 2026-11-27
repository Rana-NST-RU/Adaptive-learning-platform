// Tiny fetch helper for client components.
export async function api<T = unknown>(url: string, payload?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method ?? (payload === undefined ? 'GET' : 'POST'),
    headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

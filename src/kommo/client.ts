export class KommoError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, opts?: { status?: number; body?: string }) {
    super(message);
    this.name = "KommoError";
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

function baseUrl(): string {
  const sub = process.env.KOMMO_SUBDOMAIN;
  if (!sub) throw new KommoError("Missing env KOMMO_SUBDOMAIN");
  return `https://${sub}.kommo.com/api/v4`;
}

function authHeaders(): Record<string, string> {
  const token = process.env.KOMMO_ACCESS_TOKEN;
  if (!token) throw new KommoError("Missing env KOMMO_ACCESS_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function kommoRequest<T>(args: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: any;
}): Promise<T> {
  const url = new URL(baseUrl() + args.path);
  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: args.method,
    headers: authHeaders(),
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new KommoError(`Kommo API error ${res.status} ${res.statusText}`, { status: res.status, body });
  }

    const txt = await res.text().catch(() => "");
  if (!txt) return {} as T;
  try {
    return JSON.parse(txt) as T;
  } catch {
    // Some Kommo endpoints may return non-JSON on success
    return {} as T;
  }

}

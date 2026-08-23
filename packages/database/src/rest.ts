export interface SupabaseRestClientOptions {
  url: string;
  publishableKey: string;
  accessToken: string;
}

export interface SupabaseRestClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "SupabaseRestError";
  }
}

export function createSupabaseRestClient(options: SupabaseRestClientOptions): SupabaseRestClient {
  const baseUrl = options.url.replace(/\/+$/, "");

  return {
    async request<T>(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("apikey", options.publishableKey);
      headers.set("Authorization", `Bearer ${options.accessToken}`);

      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });
      const responseBody = await response.text();

      if (!response.ok) {
        throw new SupabaseRestError(
          `Supabase request failed with status ${response.status}`,
          response.status,
          responseBody,
        );
      }

      if (!responseBody) {
        return undefined as T;
      }

      return JSON.parse(responseBody) as T;
    },
  };
}

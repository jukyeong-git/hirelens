import { cookies } from "next/headers";

import { createSupabaseRestClient, getProfile, SupabaseRestError } from "@hirelens/database";
import { parseEnvironment, type AppRole, type ProfileRecord } from "@hirelens/domain";

const accessTokenCookie = "hirelens_access_token";
const refreshTokenCookie = "hirelens_refresh_token";

interface SupabaseUser {
  id: string;
  email?: string;
}

interface PasswordSession {
  access_token: string;
  refresh_token: string;
}

export interface Viewer {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseConfiguration() {
  const environment = parseEnvironment();

  if (!environment.NEXT_PUBLIC_SUPABASE_URL || !environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new SupabaseConfigurationError(
      "Supabase URL과 Publishable key가 서버 환경변수에 설정되지 않았습니다.",
    );
  }

  return {
    url: environment.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setPasswordSession(session: PasswordSession) {
  const cookieStore = await cookies();
  cookieStore.set(accessTokenCookie, session.access_token, cookieOptions(60 * 60));
  cookieStore.set(refreshTokenCookie, session.refresh_token, cookieOptions(60 * 60 * 24 * 30));
}

export async function clearPasswordSession() {
  const cookieStore = await cookies();
  cookieStore.delete(accessTokenCookie);
  cookieStore.delete(refreshTokenCookie);
}

export async function getAuthenticatedViewer(): Promise<{
  viewer: Viewer;
  client: ReturnType<typeof createSupabaseRestClient>;
} | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(accessTokenCookie)?.value;

  if (!accessToken) {
    return null;
  }

  const configuration = getSupabaseConfiguration();
  const client = createSupabaseRestClient({
    ...configuration,
    accessToken,
  });

  try {
    const user = await client.request<SupabaseUser>("/auth/v1/user");
    const profile = await getProfile(client, user.id);

    if (!profile) {
      return null;
    }

    return {
      client,
      viewer: toViewer(user, profile),
    };
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

function toViewer(user: SupabaseUser, profile: ProfileRecord): Viewer {
  return {
    id: user.id,
    email: user.email ?? "demo-user@hirelens.example",
    displayName: profile.display_name,
    role: profile.role,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const configuration = getSupabaseConfiguration();
  const response = await fetch(
    `${configuration.url.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: configuration.publishableKey,
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new SupabaseRestError("Supabase sign-in failed", response.status, await response.text());
  }

  return (await response.json()) as PasswordSession;
}

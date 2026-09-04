import type {
  AuthUser,
  CreateGuardianLinkRequest,
  GuardianLink,
  LoginRequest,
  RiskRecord,
  RiskRequest,
  SignupRequest,
} from "@/lib/client-types";

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { error?: string } : null;
  if (!response.ok) throw new Error(body?.error ?? `요청에 실패했습니다. (${response.status})`);
  if (body === null) throw new Error("서버가 빈 응답을 반환했습니다.");
  return body;
}

export async function checkRisk(input: RiskRequest): Promise<RiskRecord> {
  return readResponse<RiskRecord>(await fetch("/api/check-risk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function getRiskHistory(params?: {
  seniorUserId?: string;
  guardianEmail?: string;
}): Promise<RiskRecord[]> {
  const search = new URLSearchParams();
  if (params?.seniorUserId) search.set("seniorUserId", params.seniorUserId);
  if (params?.guardianEmail) search.set("guardianEmail", params.guardianEmail);
  const query = search.toString();
  return readResponse<RiskRecord[]>(await fetch(
    query ? `/api/check-risk?${query}` : "/api/check-risk",
    { cache: "no-store" },
  ));
}

export async function createGuardianLink(input: CreateGuardianLinkRequest): Promise<GuardianLink> {
  return readResponse<GuardianLink>(await fetch("/api/guardian-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function getGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  return readResponse<GuardianLink[]>(await fetch(
    `/api/guardian-link?seniorUserId=${encodeURIComponent(seniorUserId)}`,
    { cache: "no-store" },
  ));
}

export async function getSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  return readResponse<GuardianLink[]>(await fetch(
    `/api/guardian-link?guardianEmail=${encodeURIComponent(guardianEmail)}`,
    { cache: "no-store" },
  ));
}

export async function updateGuardianAlert(input: {
  seniorUserId: string;
  guardianEmail: string;
  alertEnabled: boolean;
}): Promise<GuardianLink> {
  return readResponse<GuardianLink>(await fetch("/api/guardian-link", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function removeGuardianLink(seniorUserId: string, guardianEmail: string) {
  const query = new URLSearchParams({ seniorUserId, guardianEmail });
  return readResponse<{ ok: true }>(await fetch(`/api/guardian-link?${query}`, {
    method: "DELETE",
  }));
}

export async function signup(input: SignupRequest): Promise<AuthUser> {
  return readResponse<AuthUser>(await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function login(input: LoginRequest): Promise<AuthUser> {
  return readResponse<AuthUser>(await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function logout(): Promise<void> {
  await readResponse<{ ok: true }>(await fetch("/api/auth/logout", { method: "POST" }));
}

export async function getMe(): Promise<AuthUser> {
  return readResponse<AuthUser>(await fetch("/api/auth/me", { cache: "no-store" }));
}

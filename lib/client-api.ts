import type {
  CreateGuardianLinkRequest,
  GuardianLink,
  RiskRecord,
  RiskRequest,
} from "@/lib/client-types";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "요청에 실패했습니다.");
  return body as T;
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
  const searchParams = new URLSearchParams();
  if (params?.seniorUserId) searchParams.set("seniorUserId", params.seniorUserId);
  if (params?.guardianEmail) searchParams.set("guardianEmail", params.guardianEmail);

  const query = searchParams.toString();
  const url = query ? `/api/check-risk?${query}` : "/api/check-risk";
  return readResponse<RiskRecord[]>(await fetch(url, { cache: "no-store" }));
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

export async function deleteGuardianLink(seniorUserId: string, guardianEmail: string): Promise<{ ok: true }> {
  const query = new URLSearchParams({ seniorUserId, guardianEmail });
  return readResponse<{ ok: true }>(await fetch(`/api/guardian-link?${query}`, {
    method: "DELETE",
  }));
}

import type { RiskRecord, RiskRequest } from "@/lib/client-types";

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

export async function getRiskHistory(): Promise<RiskRecord[]> {
  return readResponse<RiskRecord[]>(await fetch("/api/check-risk", { cache: "no-store" }));
}

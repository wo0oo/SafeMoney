import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

// 보호자-피보호자 연결 한 건. 1 시니어 : N 보호자 — 같은 seniorUserId를 가진
// 레코드가 여러 개 있을 수 있는 flat 배열로 저장한다(data/guardian-links.json).
// guardianEmail이 곧 보호자 식별자다 — 보호자 쪽 로그인/계정 시스템이 아직 없다.
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  createdAt: string;
};

export async function listAllGuardianLinks(): Promise<GuardianLink[]> {
  return readJSON<GuardianLink[]>("guardian-links.json");
}

// 시니어 화면(보호자 목록)과 check-risk 알림 발송이 사용.
export async function listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.seniorUserId === seniorUserId);
}

// 보호자 화면(가족/피보호자 목록)이 사용.
export async function listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.guardianEmail === guardianEmail);
}

// seniorUserId + guardianEmail 조합이 이미 있으면 null을 반환한다(중복 연결 방지).
// 승인/대기 절차 없이 즉시 등록되는 게 이 기능의 설계 전제다.
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
}): Promise<GuardianLink | null> {
  const links = await listAllGuardianLinks();
  const exists = links.some(
    (l) => l.seniorUserId === input.seniorUserId && l.guardianEmail === input.guardianEmail
  );
  if (exists) {
    return null;
  }

  const link: GuardianLink = {
    id: crypto.randomUUID(),
    seniorUserId: input.seniorUserId,
    guardianEmail: input.guardianEmail,
    guardianName: input.guardianName,
    relation: input.relation,
    createdAt: nowKstIso(),
  };
  links.push(link);
  await writeJSON("guardian-links.json", links);
  return link;
}

export async function deleteGuardianLink(id: string): Promise<boolean> {
  const links = await listAllGuardianLinks();
  const next = links.filter((l) => l.id !== id);
  if (next.length === links.length) {
    return false;
  }
  await writeJSON("guardian-links.json", next);
  return true;
}

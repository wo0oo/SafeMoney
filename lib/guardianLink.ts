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
  alertEnabled?: boolean;
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
  alertEnabled?: boolean;
}): Promise<GuardianLink | null> {
  const seniorUserId = input.seniorUserId.trim();
  const guardianEmail = input.guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const exists = links.some(
    (l) => l.seniorUserId === seniorUserId && l.guardianEmail === guardianEmail
  );
  if (exists) {
    return null;
  }

  const link: GuardianLink = {
    id: crypto.randomUUID(),
    seniorUserId,
    guardianEmail,
    guardianName: input.guardianName,
    relation: input.relation,
    alertEnabled: input.alertEnabled ?? true,
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

// id 단독 대신 seniorUserId + guardianEmail 조합으로 삭제한다 — id는 GET으로 노출되므로
// id만 알면 누구나 삭제할 수 있는 것을 막기 위함(그 시니어-보호자 조합을 이미 아는 사람만 삭제 가능).
// createGuardianLink와 동일한 정규화(trim / guardianEmail toLowerCase)로 비교한다.
export async function deleteGuardianLinkByPair(
  seniorUserId: string,
  guardianEmail: string
): Promise<boolean> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const next = links.filter(
    (l) => !(l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail)
  );
  if (next.length === links.length) {
    return false;
  }
  await writeJSON("guardian-links.json", next);
  return true;
}

// seniorUserId + guardianEmail 조합으로 특정 연결 하나를 찾는다. check-risk GET의 접근
// 검증과 updateGuardianLinkAlert 양쪽에서 재사용한다. createGuardianLink와 동일한 정규화를 쓴다.
export async function findGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  return (
    links.find(
      (l) => l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail
    ) ?? null
  );
}

// 특정 연결의 alertEnabled만 갱신한다. 대상이 없으면 null.
export async function updateGuardianLinkAlert(
  seniorUserId: string,
  guardianEmail: string,
  alertEnabled: boolean
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const index = links.findIndex(
    (l) => l.seniorUserId === normalizedSeniorUserId && l.guardianEmail === normalizedGuardianEmail
  );
  if (index === -1) {
    return null;
  }

  links[index] = { ...links[index], alertEnabled };
  await writeJSON("guardian-links.json", links);
  return links[index];
}

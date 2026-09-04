import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

// 보호자-피보호자 연결 한 건. 1 시니어 : N 보호자 — 같은 seniorUserId를 가진
// 레코드가 여러 개 있을 수 있는 flat 배열로 저장한다(data/guardian-links.json).
// guardianEmail이 곧 보호자 식별자다.
//
// status: 보호자가 시니어를 추가한 경우("initiatedBy: guardian")는 "pending"으로
// 생성되고 시니어가 승인해야 "approved"로 바뀐다. 시니어가 보호자를 추가한 경우는
// 승인 절차 없이 바로 "approved"로 생성된다. 필드가 없는 레거시 레코드는 전부
// approved로 취급한다(status !== "pending" 이면 승인된 것으로 본다) — 마이그레이션 불필요.
export type GuardianLink = {
  id: string;
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status?: "pending" | "approved";
  createdAt: string;
};

export async function listAllGuardianLinks(): Promise<GuardianLink[]> {
  return readJSON<GuardianLink[]>("guardian-links.json");
}

// 시니어 화면(보호자 목록)과 check-risk 알림 발송이 사용. 승인된 연결만 반환한다 —
// 미승인 보호자에게는 알림이 가면 안 되고, 시니어의 "등록된 보호자" 화면에도
// 보이면 안 된다(대기 요청은 별도로 listPendingRequestsForSenior가 담당).
export async function listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.seniorUserId === seniorUserId && l.status !== "pending");
}

// 보호자 화면(가족/피보호자 목록)이 사용. 승인된 연결만 반환한다 — 보호자가 아직
// 승인 안 된 시니어의 거래 이력을 보게 되는 걸 막는 핵심 지점 중 하나.
export async function listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  return links.filter((l) => l.guardianEmail === guardianEmail && l.status !== "pending");
}

// 그 시니어에게 온, 아직 승인 안 한 요청 목록. 시니어의 "보호자 설정" 화면 전용.
export async function listPendingRequestsForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const links = await listAllGuardianLinks();
  const normalizedSeniorUserId = seniorUserId.trim();
  return links.filter((l) => l.seniorUserId === normalizedSeniorUserId && l.status === "pending");
}

// seniorUserId + guardianEmail 조합이 이미 있으면(승인 여부 무관) null을 반환한다
// (중복 연결/중복 요청 방지). status는 호출자가 명시한다 — initiatedBy가 senior면
// "approved", guardian이면 "pending"으로 라우트가 정해서 넘긴다.
export async function createGuardianLink(input: {
  seniorUserId: string;
  guardianEmail: string;
  guardianName?: string;
  relation?: string;
  alertEnabled?: boolean;
  status: "pending" | "approved";
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
    status: input.status,
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
// 대기 중 요청 거부와 승인된 연결 해제 양쪽에 재사용한다(승인 여부 상관없이 그 조합을 지운다).
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

// seniorUserId + guardianEmail 조합으로 "승인된" 연결 하나를 찾는다. check-risk GET의
// 접근 검증이 사용 — 대기 중인(미승인) 보호자는 이 함수로 찾히지 않으므로 자동으로
// 403 처리된다.
export async function findGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  return (
    links.find(
      (l) =>
        l.seniorUserId === normalizedSeniorUserId &&
        l.guardianEmail === normalizedGuardianEmail &&
        l.status !== "pending"
    ) ?? null
  );
}

// 특정 연결의 alertEnabled만 갱신한다(승인 여부 무관하게 그 조합을 찾아 갱신 —
// 실제로는 승인된 연결에서만 화면에 토글이 노출되므로 대기 중 레코드가 여기로
// 들어올 일은 없다). 대상이 없으면 null.
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

// 대기 중인 요청을 승인한다. status가 "pending"인 레코드만 대상으로 하고(이미
// approved거나 존재하지 않으면 null), 승인되면 status를 "approved"로 바꾼다.
export async function approveGuardianLink(
  seniorUserId: string,
  guardianEmail: string
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();

  const links = await listAllGuardianLinks();
  const index = links.findIndex(
    (l) =>
      l.seniorUserId === normalizedSeniorUserId &&
      l.guardianEmail === normalizedGuardianEmail &&
      l.status === "pending"
  );
  if (index === -1) {
    return null;
  }

  links[index] = { ...links[index], status: "approved" };
  await writeJSON("guardian-links.json", links);
  return links[index];
}

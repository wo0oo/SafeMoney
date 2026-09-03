import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

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

export async function listGuardiansForSenior(seniorUserId: string): Promise<GuardianLink[]> {
  const normalized = seniorUserId.trim();
  return (await listAllGuardianLinks()).filter((link) => link.seniorUserId === normalized);
}

export async function listSeniorsForGuardian(guardianEmail: string): Promise<GuardianLink[]> {
  const normalized = guardianEmail.trim().toLowerCase();
  return (await listAllGuardianLinks()).filter((link) => link.guardianEmail === normalized);
}

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

  if (links.some((link) => link.seniorUserId === seniorUserId && link.guardianEmail === guardianEmail)) {
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

export async function findGuardianLink(
  seniorUserId: string,
  guardianEmail: string,
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();
  return (await listAllGuardianLinks()).find(
    (link) => link.seniorUserId === normalizedSeniorUserId
      && link.guardianEmail === normalizedGuardianEmail,
  ) ?? null;
}

export async function updateGuardianLinkAlert(
  seniorUserId: string,
  guardianEmail: string,
  alertEnabled: boolean,
): Promise<GuardianLink | null> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();
  const links = await listAllGuardianLinks();
  const index = links.findIndex(
    (link) => link.seniorUserId === normalizedSeniorUserId
      && link.guardianEmail === normalizedGuardianEmail,
  );
  if (index === -1) return null;

  links[index] = { ...links[index], alertEnabled };
  await writeJSON("guardian-links.json", links);
  return links[index];
}

export async function deleteGuardianLinkByPair(
  seniorUserId: string,
  guardianEmail: string,
): Promise<boolean> {
  const normalizedSeniorUserId = seniorUserId.trim();
  const normalizedGuardianEmail = guardianEmail.trim().toLowerCase();
  const links = await listAllGuardianLinks();
  const next = links.filter(
    (link) => !(link.seniorUserId === normalizedSeniorUserId
      && link.guardianEmail === normalizedGuardianEmail),
  );
  if (next.length === links.length) return false;

  await writeJSON("guardian-links.json", next);
  return true;
}

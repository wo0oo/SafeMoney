import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

export const SESSION_COOKIE_NAME = "safemoney_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일

export type Session = {
  token: string;
  userId: string;
  createdAt: string;
};

export async function listAllSessions(): Promise<Session[]> {
  try {
    return await readJSON<Session[]>("sessions.json");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blob store에 sessions.json이 없습니다")) {
      return [];
    }
    throw error;
  }
}

export async function createSession(userId: string): Promise<Session> {
  const sessions = await listAllSessions();
  const session: Session = {
    token: crypto.randomUUID(),
    userId,
    createdAt: nowKstIso(),
  };
  sessions.push(session);
  await writeJSON("sessions.json", sessions);
  return session;
}

export async function findSession(token: string): Promise<Session | null> {
  const sessions = await listAllSessions();
  const session = sessions.find((s) => s.token === token) ?? null;
  if (!session) return null;
  if (Date.now() - Date.parse(session.createdAt) > SESSION_MAX_AGE_SECONDS * 1000) {
    return null;
  }
  return session;
}

export async function deleteSession(token: string): Promise<void> {
  const sessions = await listAllSessions();
  const next = sessions.filter((s) => s.token !== token);
  await writeJSON("sessions.json", next);
}

import bcrypt from "bcryptjs";
import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";
import { listAllGuardianLinks } from "@/lib/guardianLink";
import type { RiskRecord } from "@/lib/riskEngine";

// 계정 한 건. username은 role 구분 없이 전체 유니크 — 시니어는 username이 곧
// RiskRecord.userId / GuardianLink.seniorUserId로, 보호자는 email이 곧
// GuardianLink.guardianEmail로 쓰인다(회원가입만으로 기존 스키마와 맞물리게 하기 위함).
export type UserRole = "senior" | "guardian";

export type User = {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function listAllUsers(): Promise<User[]> {
  try {
    return await readJSON<User[]>("users.json");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blob store에 users.json이 없습니다")) {
      return [];
    }
    throw error;
  }
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await listAllUsers();
  const normalized = username.trim();
  return users.find((u) => u.username === normalized) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = await listAllUsers();
  return users.find((u) => u.id === id) ?? null;
}

// 시니어 username은 곧 RiskRecord.userId/GuardianLink.seniorUserId로 쓰이는데, users.json에는
// 없어도 그 값이 이미 다른 자료(위험 이력·보호자 연결)에 쓰이고 있을 수 있다(예: 로그인 붙기
// 전 하드코딩으로 쌓인 u_01). 그 경우를 안 막으면 먼저 그 아이디로 가입한 사람이 남의 위험
// 이력·보호자 연결을 그대로 이어받는다(jeon0220 PR #22 코멘트). 두 자료 모두 블롭이 아직
// 없는 환경(그 리소스에 한 번도 쓰기가 없었던 경우)에서는 readJSON이 던지는데, 그건 "아직
// 아무 이력도 없다"는 뜻이니 통과시킨다(users.ts/session.ts의 기존 방어 패턴과 동일).
async function isSeniorUsernameTaken(username: string): Promise<boolean> {
  let history: RiskRecord[];
  try {
    history = await readJSON<RiskRecord[]>("risk-history.json");
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blob store에 risk-history.json이 없습니다")) {
      history = [];
    } else {
      throw error;
    }
  }
  if (history.some((r) => r.userId === username)) {
    return true;
  }

  let guardianLinks: Awaited<ReturnType<typeof listAllGuardianLinks>>;
  try {
    guardianLinks = await listAllGuardianLinks();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Blob store에 guardian-links.json이 없습니다")) {
      guardianLinks = [];
    } else {
      throw error;
    }
  }
  return guardianLinks.some((l) => l.seniorUserId === username);
}

// username이 이미 있으면 null(회원가입 라우트가 409로 매핑).
export async function createUser(input: {
  username: string;
  password: string;
  name: string;
  email: string;
  role: UserRole;
}): Promise<User | null> {
  const username = input.username.trim();
  const users = await listAllUsers();
  if (users.some((u) => u.username === username)) {
    return null;
  }
  if (input.role === "guardian" && users.some((u) => u.email === input.email.trim().toLowerCase())) {
    return null;
  }
  if (input.role === "senior" && (await isSeniorUsernameTaken(username))) {
    return null;
  }

  const user: User = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await bcrypt.hash(input.password, 10),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    createdAt: nowKstIso(),
  };
  users.push(user);
  await writeJSON("users.json", users);
  return user;
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}

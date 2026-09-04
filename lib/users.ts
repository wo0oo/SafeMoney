import bcrypt from "bcryptjs";
import { readJSON, writeJSON } from "@/lib/db";
import { nowKstIso } from "@/lib/time";

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

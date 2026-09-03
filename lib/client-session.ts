export const DEFAULT_SENIOR_USER_ID = "u_01";
export const DEFAULT_GUARDIAN_EMAIL = "ij5943@naver.com";

export function getCurrentSeniorUserId(): string {
  if (typeof window === "undefined") return DEFAULT_SENIOR_USER_ID;
  return localStorage.getItem("safemoney-senior-user-id")?.trim() || DEFAULT_SENIOR_USER_ID;
}

export function getCurrentGuardianEmail(): string {
  if (typeof window === "undefined") return DEFAULT_GUARDIAN_EMAIL;
  return localStorage.getItem("safemoney-guardian-email")?.trim().toLowerCase() || DEFAULT_GUARDIAN_EMAIL;
}

export function rememberSeniorUserId(seniorUserId: string): void {
  localStorage.setItem("safemoney-senior-user-id", seniorUserId.trim());
}

export function rememberGuardianEmail(guardianEmail: string): void {
  localStorage.setItem("safemoney-guardian-email", guardianEmail.trim().toLowerCase());
}

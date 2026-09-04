"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/client-api";
import type { AuthUser, UserRole } from "@/lib/client-types";

const SessionContext = createContext<AuthUser | null>(null);

// AppShell/GuardianShell 최상단에서 사용. 로그인 사용자를 한 번만 불러와서
// children 전체(중첩된 페이지/컴포넌트)에 컨텍스트로 배포한다. 미로그인이거나
// role이 requiredRole과 다르면 loginHref로 즉시 리다이렉트하고 children을 렌더하지 않는다
// (그 아래에서 useSession()을 부르는 컴포넌트가 항상 값이 있다고 가정할 수 있게 하기 위함).
export function SessionProvider({ requiredRole, loginHref, children }: {
  requiredRole: UserRole;
  loginHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        if (user.role !== requiredRole) {
          router.replace(loginHref);
          return;
        }
        setMe(user);
      })
      .catch(() => {
        if (!cancelled) router.replace(loginHref);
      });
    return () => {
      cancelled = true;
    };
  }, [requiredRole, loginHref, router]);

  if (!me) return null;
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export function useSession(): AuthUser {
  const me = useContext(SessionContext);
  if (!me) {
    throw new Error("useSession은 SessionProvider 내부에서만 사용할 수 있습니다.");
  }
  return me;
}

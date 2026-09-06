"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session-context";

export default function GuardianLayout({ children }: { children: ReactNode }) {
  return <SessionProvider requiredRole="guardian" loginHref="/login/guardian">{children}</SessionProvider>;
}

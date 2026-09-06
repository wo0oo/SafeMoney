"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session-context";

export default function ElderLayout({ children }: { children: ReactNode }) {
  return <SessionProvider requiredRole="senior" loginHref="/login/elder">{children}</SessionProvider>;
}

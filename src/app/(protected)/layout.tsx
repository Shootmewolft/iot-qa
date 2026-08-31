import type * as React from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireSession } from "@/lib/auth/dal";

/**
 * Layout for every authenticated screen.
 *
 * `proxy.ts` already redirected anonymous browsers, but that is an optimistic
 * check. This re-verification is the one that actually gates rendering, and it
 * runs close to the data as the Next.js auth guide recommends.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return <AppShell>{children}</AppShell>;
}

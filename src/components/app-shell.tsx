import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader authenticated />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}

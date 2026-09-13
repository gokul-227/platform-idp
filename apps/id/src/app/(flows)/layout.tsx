import { BuildOsLockup } from "@aec-craft/ui/components/branding/buildos-lockup";
import type { ReactNode } from "react";

export default function Layout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <BuildOsLockup className="self-start" size={24} />
      {children}
    </main>
  );
}

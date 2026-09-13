"use client";

import { AdminClient } from "@aec-craft/platform-admin-sdk";
import { AdminProvider } from "@aec-craft/platform-admin-sdk/react";
import { PlatformClient } from "@aec-craft/platform-sdk";
import { PlatformProvider } from "@aec-craft/platform-sdk/react";
import { Toaster } from "@aec-craft/ui/components/primitives/sonner";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

/** This app's relay (`app/api/[...path]/route.ts`), which attaches the token. */
const BASE_URL = "/api";

export function ConsoleProviders({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [platform] = useState(() => new PlatformClient({ baseUrl: BASE_URL }));
  const [admin] = useState(() => new AdminClient({ baseUrl: BASE_URL }));
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <PlatformProvider client={platform} queryClient={queryClient}>
      <AdminProvider client={admin}>
        {children}
        <Toaster />
      </AdminProvider>
    </PlatformProvider>
  );
}

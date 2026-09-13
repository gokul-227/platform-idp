"use client";

import { PlatformClient } from "@aec-craft/platform-sdk";
import { PlatformProvider } from "@aec-craft/platform-sdk/react";
import { Toaster } from "@aec-craft/ui/components/primitives/sonner";
import { QueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

/** This app's relay (`app/api/[...path]/route.ts`), which attaches the token. */
const BASE_URL = "/api";

export function PlatformProviders({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [client] = useState(() => new PlatformClient({ baseUrl: BASE_URL }));
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <PlatformProvider client={client} queryClient={queryClient}>
      {children}
      <Toaster />
    </PlatformProvider>
  );
}

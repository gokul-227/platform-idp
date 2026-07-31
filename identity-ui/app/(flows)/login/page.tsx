import type { ReactNode } from "react";

import { getBrowserFlow } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";
import { LoginFlow } from "@/components/login-flow";
import type { FlowSearchParams } from "@/types/flow";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const flow = await getBrowserFlow("login", await searchParams);

  return (
    <AuthShell title="Sign in">
      <LoginFlow flow={flow} />
    </AuthShell>
  );
}

import type { ReactNode } from "react";

import { getBrowserFlow } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";
import { FlowForm } from "@/components/flow-form";
import type { FlowSearchParams } from "@/types/flow";

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const flow = await getBrowserFlow("recovery", await searchParams);

  return (
    <AuthShell title="Recover your account">
      <FlowForm flow={flow} />
    </AuthShell>
  );
}

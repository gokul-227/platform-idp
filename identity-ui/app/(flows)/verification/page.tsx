import type { ReactNode } from "react";

import { getBrowserFlow } from "@/adapters/kratos-flow";
import { AuthShell } from "@/components/auth-shell";
import { FlowForm } from "@/components/flow-form";
import type { FlowSearchParams } from "@/types/flow";

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<FlowSearchParams>;
}): Promise<ReactNode> {
  const flow = await getBrowserFlow("verification", await searchParams);

  return (
    <AuthShell title="Verify your email">
      <FlowForm flow={flow} />
    </AuthShell>
  );
}

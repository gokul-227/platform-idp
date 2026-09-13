import type { ReactNode } from "react";
import { OrganizationDetail } from "./organization.detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  return <OrganizationDetail orgId={id} />;
}

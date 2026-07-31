// The Card for one flow page — matches
// .reference/platform-ory-id-spike/apps/id's per-page Card usage exactly
// (e.g. src/app/(flows)/page.tsx: `<Card className="gap-8"><CardHeader>...
// </Card>`, no manual centering — that's the parent layout's job, see
// app/(flows)/layout.tsx). Page-level centering used to live here too;
// moved out once the shared layout existed, same split as the reference.

import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/vendor/ui/card";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Card className="gap-8">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

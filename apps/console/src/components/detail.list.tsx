import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aec-craft/ui/components/primitives/card";
import type { ReactNode } from "react";

/**
 * Detail-page building blocks. Ory returns far more per record than is worth
 * showing unconditionally, so rows and sections drop out when they carry no
 * value; a card full of "none" reads as noise and hides the fields that are
 * actually set.
 */
export function DetailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DetailList({ children }: { children: ReactNode }): ReactNode {
  return (
    <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-2.5 text-sm">
      {children}
    </dl>
  );
}

function isEmpty(value: ReactNode): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}): ReactNode {
  if (isEmpty(value)) {
    return null;
  }
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : "break-words"}>
        {value}
      </dd>
    </div>
  );
}

/** One value per line, for the URI and contact arrays Hydra returns. */
export function DetailLines({
  values,
}: {
  values: readonly string[] | undefined;
}): ReactNode {
  if (!values || values.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-1">
      {values.map((value) => (
        <li className="break-all font-mono text-xs" key={value}>
          {value}
        </li>
      ))}
    </ul>
  );
}

export function DetailJson({ value }: { value: unknown }): ReactNode {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-4 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** True when an Ory `metadata`-style bag holds anything worth a section. */
export function hasEntries(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value as object).length > 0
  );
}

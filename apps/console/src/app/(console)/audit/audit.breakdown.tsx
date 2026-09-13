import Link from "next/link";
import type { ReactNode } from "react";

/** A labelled list with counts — one quadrant of the analytics insights card. */
export function AuditBreakdown({
  empty,
  href,
  rows,
  title,
}: {
  empty: string;
  /** Builds the filter link for a row, given its id rather than its label:
   *  an actor's label is a snapshot that can go stale, the id cannot. */
  href?: (id: string) => string;
  rows: { count: number; id: string; label: string }[];
  title: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
        {title}
      </span>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((row) => (
            <li
              className="flex items-center justify-between gap-3"
              key={row.id}
            >
              {href ? (
                <Link className="truncate hover:underline" href={href(row.id)}>
                  {row.label}
                </Link>
              ) : (
                <span className="truncate">{row.label}</span>
              )}
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

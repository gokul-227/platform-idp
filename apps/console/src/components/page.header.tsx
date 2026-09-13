import { CaretLeftIcon } from "@aec-craft/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Page title strip, sticky rather than a wrapper because the layout already owns
 * the scroll. Negative margins cancel the page padding, so the frosted band spans
 * the full width and nothing shows through above it.
 *
 * Not built on `blocks/header`, which renders an `h2` with no back link and no
 * slot beside the title: composing on it would mean wrapping it and then
 * rendering the back link outside its own layout. aec-craft/ui#30 adds both, and
 * this file goes when it lands.
 */
export function PageHeader({
  title,
  back,
  badges,
  description,
  actions,
}: {
  title: string;
  /** Where this page sits under. A detail page reached from a row otherwise
   *  leaves the browser's own back button as the only way out, which says
   *  nothing about where "out" is. */
  back?: { href: string; label: string };
  /** Rendered beside the title, for what this page's subject *is* — an
   *  authority, a state. `actions` is for what you can do to it. */
  badges?: ReactNode;
  description?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 flex items-start justify-between gap-4 border-rule border-b bg-background/80 px-6 pt-6 pb-4 backdrop-blur">
      <div className="flex min-w-0 flex-col gap-1">
        {back ? (
          <Link
            className="-ml-1 flex w-fit items-center gap-0.5 text-muted-foreground text-xs hover:text-foreground hover:underline"
            href={back.href}
          >
            <CaretLeftIcon className="size-3" />
            {back.label}
          </Link>
        ) : null}
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
          {badges}
        </div>
        {description ? (
          <p className="max-w-prose text-muted-foreground text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

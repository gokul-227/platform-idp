import { CaretLeftIcon } from "@aec-craft/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The parent a page returns to, rendered above its title.
 *
 * A named href rather than `router.back()`: history is wherever the visitor came
 * from, so a page opened from a mailed link or a pasted URL would send them out
 * of the account entirely. Every page that has a parent knows its route.
 *
 * Same treatment as the console's audit detail — caret glyph, muted until hover
 * — because the two surfaces are read by the same people and a second back
 * affordance would read as a different kind of link. The caret is an icon rather
 * than a literal `←` so it inherits the text metrics at any size and is not
 * announced as a character by a screen reader.
 */
export function BackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}): ReactNode {
  return (
    <Link
      className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      href={href}
    >
      <CaretLeftIcon className="size-3.5" />
      Back to {label}
    </Link>
  );
}

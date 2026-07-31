import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Identical to ui-neobim/packages/ui/lib/utils.ts's `cn` — defined locally
// because Turbopack's externalDir resolution of that package's plain-`.ts`
// (non-`.tsx`) export subpaths fails while its `.tsx` component subpaths
// resolve fine (confirmed live, isolated to exactly these two exports:
// "./fonts" and "./lib/*"). Not a source change to ui-neobim itself.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

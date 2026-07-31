import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Identical to ui/packages/ui/lib/utils.ts's `cn` — defined locally because
// Turbopack's externalDir resolution of that package's plain-.ts export
// subpaths ("./lib/*") fails when live-linked via a `file:` dependency
// (confirmed live in this app, same class of bug already documented in
// applications/neobim/neobim-ui/src/lib/cn.ts). Not a source change to `ui` itself.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

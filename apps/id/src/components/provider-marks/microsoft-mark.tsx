import type { ReactNode, SVGProps } from "react";

/**
 * Official Microsoft mark (four colored squares). Brand colors are hard-coded;
 * Microsoft prohibits recoloring. Ported from the design-system repo.
 */
export function MicrosoftMark(props: SVGProps<SVGSVGElement>): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 23 23"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M1 1h10v10H1z" fill="#F25022" />
      <path d="M12 1h10v10H12z" fill="#7FBA00" />
      <path d="M1 12h10v10H1z" fill="#00A4EF" />
      <path d="M12 12h10v10H12z" fill="#FFB900" />
    </svg>
  );
}

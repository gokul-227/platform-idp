/**
 * How a status reads as a badge, keyed by the status itself: one lookup from the
 * value to the label and the look, with no tone vocabulary in between.
 *
 * `POSITIVE` is a local class because the design system defines `--destructive`
 * and no counterpart — aec-craft/ui#29 adds the token, and this is the one line
 * that changes when it lands. Everything else is a variant the system already
 * defines, dark mode included, so it is named rather than restated.
 */
const POSITIVE = {
  className:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  variant: "outline",
} as const;

const NEGATIVE = { variant: "destructive" } as const;

/** An outcome the model did not write. Neither colour, rather than a guess. */
export const UNKNOWN_STATUS = { variant: "secondary" } as const;

/** A refusal and a failure are both the answer nobody wanted. */
export const AUDIT_STATUS_BADGE: Record<
  string,
  typeof POSITIVE | typeof NEGATIVE
> = {
  denied: NEGATIVE,
  failure: NEGATIVE,
  success: POSITIVE,
};

/**
 * Whether an account may sign in. Anything Kratos does not call `active` cannot,
 * and the word it uses for that is not one a reader needs.
 */
export const IDENTITY_STATE_BADGE = {
  active: { ...POSITIVE, label: "Active" },
  inactive: { ...NEGATIVE, label: "Deactivated" },
} as const;

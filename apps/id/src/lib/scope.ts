/**
 * What a scope is called, in the two registers the surfaces need.
 *
 * Consent is a decision, so it spells out what is being agreed to; the account
 * page is a review of decisions already made, and a list of sentences there
 * stops being readable at the third application. The scope itself travels to
 * Hydra unchanged; only what the reader sees differs. An unrecognised scope
 * falls back to its own name, which is ugly and honest, rather than hidden.
 */

const SCOPE_SENTENCE: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name and picture",
  email: "See your email address",
  offline_access: "Stay signed in when you come back",
};

const SCOPE_LABEL: Record<string, string> = {
  openid: "Sign-in",
  profile: "Profile",
  email: "Email",
  offline_access: "Offline access",
};

/** For agreeing to one: the whole thing said as a sentence. */
export function scopeSentence(scope: string): string {
  return SCOPE_SENTENCE[scope] ?? scope;
}

/** For listing several: a name short enough to sit in a row of them. */
export function scopeLabel(scope: string): string {
  return SCOPE_LABEL[scope] ?? scope;
}

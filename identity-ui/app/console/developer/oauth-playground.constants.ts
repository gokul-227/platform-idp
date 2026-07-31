// Split out of actions.ts: a "use server" file may only export async
// functions — a plain string constant export there silently invalidates
// every export in that module (confirmed live via a Turbopack build
// failure: "The module has no exports at all").
export const OAUTH_PLAYGROUND_COOKIE = "oauth_playground_pkce";

/** Injection token for the verifier, so a test can supply its own. */
export const TOKEN_VERIFIER = "PLATFORM_ID_TOKEN_VERIFIER";

/** Metadata keys. Strings, because a Symbol does not survive a module boundary. */
export const PUBLIC_ROUTE = "platform-id:public";
export const REQUIRED_AAL = "platform-id:required-aal";

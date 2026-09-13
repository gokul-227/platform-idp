/**
 * Grant types the console offers, in form order. Hydra validates neither the
 * create nor the patch body, so this list is also what the actions check a
 * submission against: an unknown grant type is otherwise stored exactly as
 * sent and the client fails much later, at the token endpoint.
 */
export const GRANT_TYPES = [
  {
    description: "Browser sign-in on behalf of a user. Needs a redirect URI.",
    value: "authorization_code",
  },
  {
    description: "Renew access tokens without re-prompting the user.",
    value: "refresh_token",
  },
  {
    description: "Machine-to-machine. No user involved.",
    value: "client_credentials",
  },
] as const;

export const GRANT_VALUES: readonly string[] = GRANT_TYPES.map(
  (grant) => grant.value
);

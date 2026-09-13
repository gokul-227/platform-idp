// Maps Google OIDC claims onto the default identity schema. Email is taken
// only when Google asserts it verified, so an attacker cannot squat an
// address and link into an existing account.
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims && claims.email_verified then 'email' else null]: claims.email,
      name: {
        first: if 'given_name' in claims then claims.given_name else '',
        last: if 'family_name' in claims then claims.family_name else '',
      },
    },
  },
}

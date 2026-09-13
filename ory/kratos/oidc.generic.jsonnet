// Enterprise IdPs rarely send email_verified, so the trust boundary is the
// connection itself. Production must pin each connection to its domain before
// trusting `email`.
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        first: if 'given_name' in claims then claims.given_name else '',
        last: if 'family_name' in claims then claims.family_name else '',
      },
    },
  },
}

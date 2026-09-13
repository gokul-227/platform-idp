// Maps Entra ID claims onto the default identity schema, gated on xms_edov:
// Entra's assertion that the tenant verified the email's domain. It sends no
// email_verified and the tenant is `common`, so without the gate anyone with
// their own tenant could assert an address they do not control.
//
// Fails closed: the claim is optional, so a registration that does not request it
// maps no email rather than trusting one. Configure the claim, do not relax this.
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims && 'xms_edov' in claims && claims.xms_edov then 'email' else null]: claims.email,
      name: {
        first: if 'given_name' in claims then claims.given_name else '',
        last: if 'family_name' in claims then claims.family_name else '',
      },
    },
  },
}

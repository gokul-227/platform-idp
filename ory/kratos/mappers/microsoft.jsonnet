// Microsoft OIDC Claims → Kratos Identity Mapper
// Supports both Microsoft personal accounts and Azure AD / Entra ID work accounts
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email:
        // Work accounts: use 'preferred_username' (UPN) or 'email'
        // Personal accounts: use 'email'
        if std.objectHas(claims, 'email') && claims.email != null then
          claims.email
        else if std.objectHas(claims, 'preferred_username') then
          claims.preferred_username
        else
          error 'Microsoft OIDC: no email claim found in token',

      [if std.objectHas(claims, 'given_name') then 'name' else null]: {
        first: claims.given_name,
        [if std.objectHas(claims, 'family_name') then 'last' else null]: claims.family_name,
      },

      [if std.objectHas(claims, 'picture') then 'avatar' else null]: claims.picture,

      // Microsoft locale uses - separator (en-US); normalize to BCP47
      [if std.objectHas(claims, 'locale') then 'locale' else null]: claims.locale,
    },
  },
}

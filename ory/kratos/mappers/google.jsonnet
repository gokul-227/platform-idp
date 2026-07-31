// Google OIDC Claims → Kratos Identity Mapper
// Transforms Google's token claims into the enterprise-user identity schema
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      // Email is always provided by Google (required scope)
      email: claims.email,

      // Name from Google profile
      [if std.objectHas(claims, 'given_name') then 'name' else null]: {
        first: claims.given_name,
        [if std.objectHas(claims, 'family_name') then 'last' else null]: claims.family_name,
      },

      // Avatar from Google profile picture
      [if std.objectHas(claims, 'picture') then 'avatar' else null]: claims.picture,

      // Locale from Google claims
      [if std.objectHas(claims, 'locale') then 'locale' else null]: claims.locale,
    },
  },
}

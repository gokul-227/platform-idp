// The body the platform's `POST /webhooks/identity` receives. `identity.id` and
// nothing derived from it: that is what the gateway puts in `sub` and what a Keto
// tuple names, so profile rows and standings join on it. The name is flattened
// here so the platform need not know this schema's shape.
function(ctx) {
  externalId: ctx.identity.id,
  email: ctx.identity.traits.email,
  name:
    if std.objectHas(ctx.identity.traits, 'name') then
      std.stripChars(
        (if std.objectHas(ctx.identity.traits.name, 'first') then ctx.identity.traits.name.first else '')
        + ' '
        + (if std.objectHas(ctx.identity.traits.name, 'last') then ctx.identity.traits.name.last else ''),
        ' '
      )
    else null,
}

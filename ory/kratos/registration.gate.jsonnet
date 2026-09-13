// Rendered from the flow's submitted traits and posted to the sign-in app's
// gate, which answers 403 for an address that may not self-register. Only the
// address is sent: the gate decides on the domain and nothing else.
function(ctx) {
  email: if std.objectHas(ctx, 'identity') && std.objectHas(ctx.identity, 'traits') && std.objectHas(ctx.identity.traits, 'email') then ctx.identity.traits.email else null,
}

// Kratos Registration Webhook Body — Jsonnet
// Sent to the hooks service after successful registration
// Kratos registers `ctx` as a jsonnet top-level argument (vm.TLACode), not
// an external variable — this must be a `function(ctx)`, not
// `local ctx = std.extVar('ctx')` (that lookup fails at runtime with
// "Undefined external variable: ctx"; see docs/10-reference/ai-handoff.md).
function(ctx) {
  event: 'user.registered',
  timestamp: ctx.request_url,
  identity: {
    id: ctx.identity.id,
    schema_id: ctx.identity.schema_id,
    state: ctx.identity.state,
    traits: {
      email: ctx.identity.traits.email,
      [if std.objectHas(ctx.identity.traits, 'username') then 'username' else null]: ctx.identity.traits.username,
      [if std.objectHas(ctx.identity.traits, 'name') then 'name' else null]: ctx.identity.traits.name,
      [if std.objectHas(ctx.identity.traits, 'organization') then 'organization' else null]: ctx.identity.traits.organization,
    },
  },
  // Session created after registration (if hook: session was run first)
  [if std.objectHas(ctx, 'session') then 'session' else null]: {
    id: ctx.session.id,
    active: ctx.session.active,
    expires_at: ctx.session.expires_at,
  },
  // Registration flow metadata
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    // Track registration method (password, oidc, code, passkey)
    method: if std.objectHas(ctx.flow, 'active') then ctx.flow.active else 'unknown',
  },
}

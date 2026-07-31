// Kratos Login Webhook Body — Jsonnet
// Sent to the hooks service after successful login
// Used for: audit logging, risk scoring, rate limit tracking, session enrichment
// Kratos registers `ctx` as a jsonnet top-level argument (vm.TLACode), not
// an external variable — this must be a `function(ctx)`, not
// `local ctx = std.extVar('ctx')` (see registration.jsonnet's comment).
function(ctx) {
  event: 'user.login',
  timestamp: ctx.request_url,
  identity: {
    id: ctx.identity.id,
    schema_id: ctx.identity.schema_id,
    traits: {
      email: ctx.identity.traits.email,
      [if std.objectHas(ctx.identity.traits, 'username') then 'username' else null]: ctx.identity.traits.username,
      [if std.objectHas(ctx.identity.traits, 'organization') then 'organization' else null]: ctx.identity.traits.organization,
    },
  },
  session: {
    id: ctx.session.id,
    active: ctx.session.active,
    expires_at: ctx.session.expires_at,
    issued_at: ctx.session.issued_at,
    authenticated_at: ctx.session.authenticated_at,
    // Authenticator Assurance Level achieved in this session
    authenticator_assurance_level: ctx.session.authenticator_assurance_level,
    // Authentication methods used in this session
    authentication_methods: ctx.session.authentication_methods,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    method: if std.objectHas(ctx.flow, 'active') then ctx.flow.active else 'unknown',
  },
  // Request context for risk-based analysis. Field access on an absent
  // header key is a hard jsonnet error (not null like Python's dict.get),
  // and these headers are frequently absent (no upstream proxy setting
  // X-Forwarded-For, no Accept-Language sent) — guard every lookup. Kratos
  // represents each header as Go's http.Header (a []string), even for
  // single-valued headers — take the first entry.
  local header(name) =
    if std.objectHas(ctx.request_headers, name) && std.length(ctx.request_headers[name]) > 0
    then ctx.request_headers[name][0]
    else null,
  request_headers: {
    user_agent: header('User-Agent'),
    accept_language: header('Accept-Language'),
    x_forwarded_for: header('X-Forwarded-For'),
    x_real_ip: header('X-Real-IP'),
  },
}

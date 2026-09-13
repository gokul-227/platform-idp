// Body for the audit web_hook, rendered per flow and posted to apps/id's
// /api/internal/events. Shape is the intake contract in
// @aec-craft/platform-id-contracts, which the receiver validates against the
// vocabulary. Carries no credential, code or session token: an audit row is read
// by more people than the flow that produced it.
function(ctx)
  local traits = if std.objectHas(ctx, "identity") && std.objectHas(ctx.identity, "traits") then ctx.identity.traits else {};
  local name = if std.objectHas(traits, "name") then traits.name else {};
  local firstLast = (if std.objectHas(name, "first") then [name.first] else []) + (if std.objectHas(name, "last") then [name.last] else []);
  {
    // A sign-in creates a session. Named for what the flow produced, not for
    // ctx.flow.type — that field is the browser/API distinction ("browser"),
    // which says nothing about what happened.
    resource: "session",
    verb: "created",
    actorType: "user",
    actorIdentityId: if std.objectHas(ctx, "identity") then ctx.identity.id else null,
    actorEmail: if std.objectHas(traits, "email") then traits.email else null,
    actorName: if std.length(firstLast) > 0 then std.join(" ", firstLast) else null,
    resourceId: if std.objectHas(ctx, "identity") then ctx.identity.id else null,
    resourceLabel: if std.objectHas(traits, "email") then traits.email else null,
    context: {
      // Which way in was used, which is the part an operator actually asks about.
      authMethod: if std.objectHas(ctx, "flow") && std.objectHas(ctx.flow, "active") then ctx.flow.active else null,
    },
    ip: if std.objectHas(ctx, "request_headers") && std.objectHas(ctx.request_headers, "X-Forwarded-For") then ctx.request_headers["X-Forwarded-For"][0] else null,
    userAgent: if std.objectHas(ctx, "request_headers") && std.objectHas(ctx.request_headers, "User-Agent") then ctx.request_headers["User-Agent"][0] else null,
  }

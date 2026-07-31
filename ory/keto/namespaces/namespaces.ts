// Ory Keto Zanzibar namespaces definition
// Implements ReBAC permission hierarchy for Platform, Orgs, Teams, Projects, and Resources
//
// THIS FILE IS A DESIGN DOCUMENT, NOT A COMPILED CONFIG: it was never run
// through `keto namespace validate`/converted into what the running Keto
// v0.12 instance actually loads (ory/keto/config/keto.yaml, which only
// declares bare namespace ids/names — no relations, no permits, no
// traversal). Every `permits`/traverse block below is a specification for
// application code to implement against real relation tuples, not
// something Keto enforces natively today. See
// docs/09-architecture/README.md for the live-verified state.
//
// TWO MODELS COEXIST in this file, and neither has been deleted:
//
// 1. Organization/Team/Project/Application/Resource (below) — the ORIGINAL
//    model. Organization/Team's `admin`/`member`/`manager` relations are
//    REAL and populated today (platform/hooks writes them on every
//    registration; platform/authorization-service's Roles/Policies pages
//    manage Project/Application/Resource tuples through the VALID_ROLE_TARGETS
//    catalog). Kept working, not superseded in practice yet.
//
// 2. Group (bottom of this file) — the NEW model from
//    `authz-architecture.html` ("Keto access design for the federated
//    model"), added this pass. Real, working, additive: a `Group` namespace
//    now exists in keto.yaml (id 7) and platform/authorization-service has
//    a real `group_authz.py` module implementing this exact permit
//    hierarchy (read granted explicitly + falls through write; write/
//    manage/admin traverse the parent tree; admin/manage/write are a
//    strict ladder) against live Keto tuples, plus a delegation guard
//    (grant strictly below your own standing) and new
//    `/api/v1/groups/{id}/{authorize,grants}` endpoints. See
//    platform/authorization-service/src/authorization_service/group_authz.py.
//
// DOCUMENTED TENSION (per this pass's own instructions: document conflicts
// rather than force a wholesale rewrite): authz-architecture.html says
// "There should not be: Role table, Permission catalog" — but
// authorization-service's roles.py/policies.py IS exactly that, a real,
// actively-used named-role catalog over the Organization/Team/Project/
// Application/Resource namespaces. It was NOT removed (would break the
// working Roles/Policies console pages) and Group was ALSO added to its
// VALID_ROLE_TARGETS so operators have both the old catalog-based path and
// the new delegation-aware Group endpoints available. Migrating
// Roles/Policies fully onto the Group model, or retiring it, is future work
// — see the "Future deletions" section of the latest implementation report.

import { Namespace, SubjectSet, Context } from "@ory/keto-namespace-types";

// User identity subject
class User implements Namespace {}

// Organization / Tenant context
class Organization implements Namespace {
  related: {
    admin: User[];
    member: User[];
    billing_admin: User[];
  };

  permits = {
    // Admins have all administrative controls
    administer: (ctx: Context): boolean => this.related.admin.includes(ctx.subject),
    // Members can read organization info
    view: (ctx: Context): boolean =>
      this.related.member.includes(ctx.subject) ||
      this.related.admin.includes(ctx.subject),
    // Billing operations
    manage_billing: (ctx: Context): boolean =>
      this.related.billing_admin.includes(ctx.subject) ||
      this.related.admin.includes(ctx.subject),
  };
}

// Teams exist inside Organizations
class Team implements Namespace {
  related: {
    parent: Organization[];
    manager: User[];
    member: User[];
  };

  permits = {
    // Org admins inherit team administration
    administer: (ctx: Context): boolean =>
      this.related.parent.traverse((org) => org.permits.administer(ctx)) ||
      this.related.manager.includes(ctx.subject),
    // Members or managers can view team info
    view: (ctx: Context): boolean =>
      this.related.parent.traverse((org) => org.permits.view(ctx)) ||
      this.related.member.includes(ctx.subject) ||
      this.related.manager.includes(ctx.subject),
  };
}

// Projects are scoped within organizations and can be assigned to Teams
class Project implements Namespace {
  related: {
    parent: Organization[];
    owner: User[];
    contributor_team: Team[];
    viewer_team: Team[];
  };

  permits = {
    // Admins and owners can administer the project
    administer: (ctx: Context): boolean =>
      this.related.parent.traverse((org) => org.permits.administer(ctx)) ||
      this.related.owner.includes(ctx.subject),
    // Contributors can write/modify project resources
    write: (ctx: Context): boolean =>
      this.permits.administer(ctx) ||
      this.related.contributor_team.traverse((team) => team.related.member.includes(ctx.subject)),
    // Viewers and team members can view the project
    view: (ctx: Context): boolean =>
      this.permits.write(ctx) ||
      this.related.viewer_team.traverse((team) => team.related.member.includes(ctx.subject)) ||
      this.related.parent.traverse((org) => org.permits.view(ctx)),
  };
}

// Applications / OIDC Clients
class Application implements Namespace {
  related: {
    parent: Organization[];
    owner: User[];
  };

  permits = {
    manage: (ctx: Context): boolean =>
      this.related.parent.traverse((org) => org.permits.administer(ctx)) ||
      this.related.owner.includes(ctx.subject),
    use: (ctx: Context): boolean =>
      this.related.parent.traverse((org) => org.permits.view(ctx)),
  };
}

// Fine-grained Resource instances (e.g. dashboards, databases, documents)
class Resource implements Namespace {
  related: {
    parent: Project[];
    owner: User[];
    editor: (User | SubjectSet<Team, "member">)[];
    viewer: (User | SubjectSet<Team, "member">)[];
  };

  permits = {
    // Owners or project admins can administer the resource
    administer: (ctx: Context): boolean =>
      this.related.parent.traverse((project) => project.permits.administer(ctx)) ||
      this.related.owner.includes(ctx.subject),
    // Editors can modify
    write: (ctx: Context): boolean =>
      this.permits.administer(ctx) ||
      this.related.editor.includes(ctx.subject),
    // Viewers can read
    view: (ctx: Context): boolean =>
      this.permits.write(ctx) ||
      this.related.viewer.includes(ctx.subject) ||
      this.related.parent.traverse((project) => project.permits.view(ctx)),
  };
}

// =============================================================================
// NEW MODEL — authz-architecture.html, "Keto access design for the
// federated model". Additive: does not replace anything above.
// =============================================================================
//
// Everything is a set of users granted a relation on a node of one tree.
// There is no role table and no permission catalog here — a group is a set
// of users, and a standing is which relation that set holds. The breadth of
// what they hold it over (org root vs. one contractor's package) is the
// only difference between "owner of the org" and "editor at one
// contractor". Reuses the `User` class already declared above.
class Group implements Namespace {
  related: {
    parent: Group[]; // org > project > contractor > package
    owners: (User | SubjectSet<Group, "owners">)[];
    managers: (User | SubjectSet<Group, "managers">)[];
    editors: (User | SubjectSet<Group, "editors">)[];
    viewers: (User | SubjectSet<Group, "viewers">)[]; // on a project group this doubles
    // as the roster of who is on it
  };
  permits = {
    read: (ctx: Context): boolean =>
      this.related.viewers.includes(ctx.subject) || this.permits.write(ctx),
    // NOT inherited from the tree. A group is readable because it granted
    // viewers to a roster, which is the privacy switch.

    write: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.permits.manage(ctx) ||
      this.related.parent.traverse((p) => p.permits.write(ctx)),

    manage: (ctx: Context): boolean =>
      this.related.managers.includes(ctx.subject) || // membership + placing and lifting locks
      this.permits.admin(ctx) ||
      this.related.parent.traverse((p) => p.permits.manage(ctx)),

    admin: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) || // group lifecycle
      this.related.parent.traverse((p) => p.permits.admin(ctx)),
  };
}

// Standing ladder (STRICT, enforced by group_authz.py's grant guard, not by
// Keto): owners > managers > editors > viewers. You may only grant
// strictly below your own standing — an owner may grant anything including
// another owner; a manager may only grant editors/viewers, never another
// manager or owner. See group_authz.py's STANDING_RANK and assert_can_grant.
//
// Locks (node_lock) and semantic search (group_id-based Pinecone
// filtering) are both deferred — see docs/09-architecture/README.md's
// "Group authorization model" section for the schema proposal and the
// reasoning for not implementing either in this pass.

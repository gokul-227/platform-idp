/**
 * Ory Permission Language, parsed and executed by Keto and never imported by app
 * code, so the classes are "unused" by design. Shipped as
 * `@aec-craft/platform-id-permissions`, so a change here reaches consumers as a
 * version bump rather than a copy. The model is documented in
 * docs/authorization.md; what follows is only what the code cannot say.
 */

import { Context, Namespace, SubjectSet } from "@ory/keto-namespace-types";

class User implements Namespace {}

class Group implements Namespace {
  related: {
    /**
     * org > project > team. Any group may have children, so a private area
     * is a child that never joined the roster rather than a level of its own:
     * the privacy is the missing grant, not a kind of thing.
     */
    parent: Group[];
    owners: (User | SubjectSet<Group, "owners">)[];
    /** Runs the tenant without being able to end it or answer for the bill. */
    admins: (User | SubjectSet<Group, "owners"> | SubjectSet<Group, "admins">)[];
    managers: (User | SubjectSet<Group, "owners"> | SubjectSet<Group, "admins"> | SubjectSet<Group, "managers">)[];
    editors: (User | SubjectSet<Group, "owners"> | SubjectSet<Group, "admins"> | SubjectSet<Group, "managers"> | SubjectSet<Group, "editors">)[];
    /**
     * On a project this doubles as the roster: one join per group, so onboarding
     * a sixth contractor does not touch the five already there. OPL takes one
     * relation per SubjectSet, hence four spelled out rather than a union.
     */
    viewers: (User | SubjectSet<Group, "owners"> | SubjectSet<Group, "admins"> | SubjectSet<Group, "managers"> | SubjectSet<Group, "editors"> | SubjectSet<Group, "viewers">)[];
  };

  permits = {
    /**
     * Flattened, never laddered: Keto spends expansion budget per link, so a
     * permit calling the one above it reaches fewer levels down and a check out
     * of budget answers denial rather than error.
     *
     * `read` traverses the parent's `write`, and the asymmetry is load-bearing:
     * following `read` upward lands in the set every child's roster join feeds,
     * and comes back down into every sibling.
     */
    read: (ctx: Context): boolean =>
      this.related.viewers.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.managers.includes(ctx.subject) ||
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parent.traverse((parent) => parent.permits.write(ctx)),

    /**
     * Carries the standing already held rather than granting one, so an
     * editor-or-better on a project can edit inside a contractor's model.
     * Deliberate; dropping the `parent.traverse` line alone turns it off
     * (docs/authorization.md).
     */
    write: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.related.managers.includes(ctx.subject) ||
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parent.traverse((parent) => parent.permits.write(ctx)),

    /** Membership, and placing or lifting locks. */
    manage: (ctx: Context): boolean =>
      this.related.managers.includes(ctx.subject) ||
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parent.traverse((parent) => parent.permits.manage(ctx)),

    /** Group lifecycle. */
    admin: (ctx: Context): boolean =>
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parent.traverse((parent) => parent.permits.admin(ctx)),

    /** Existence and the bill. Only an owner; an admin cannot end or transfer it. */
    own: (ctx: Context): boolean =>
      this.related.owners.includes(ctx.subject) ||
      this.related.parent.traverse((parent) => parent.permits.own(ctx)),
  };
}

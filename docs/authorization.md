# Authorization

Who may read, write and manage what. The model lives in
[`ory/keto/namespaces.keto.ts`](../ory/keto/namespaces.keto.ts); this page is the
shape of the API over it and the reasoning behind the vocabulary.

Not built yet. Written down first because the naming decisions here are the ones
that are expensive to reverse.

## Group is not partition

Two different questions, two different columns, and conflating them is the
mistake this whole page exists to prevent.

| Column | Answers |
| --- | --- |
| `org_id` | every project in this org |
| `project_id` | every file in this project |
| `team_id` | every file this team is working on |
| `group_id` | **who may touch this row** |

The first three are partitions: where a row lives, and what a person browses.
The last is access. A row's group defaults to the deepest partition it
belongs to, so in the ordinary case they agree and nobody thinks about it.

They must be free to diverge, though, and the cases are not exotic:

- a **handover** moves a model from one contractor to another
- **publishing** a private area moves rows up to the parent
- **lending** one folder to a neighbouring team

All three are one update to `group_id` and no change to where the row lives.
Collapse the two and every access decision becomes a navigation decision, because
a partition is what a person browses. A consultant who needs three files would
force a team into existence, and that team would appear in the sidebar forever.

## Standing

Four relations, ordered: `owners` > `managers` > `editors` > `viewers`. One tuple
per person per group, so different people hold different standings in the
same team without any exception machinery.

`standing`, not `role`: it does not collide with `staffRole`, and it stops anyone
reaching for the role vocabulary the model deliberately does not have. There is
no role table and no permission catalog.

## Position is reach, standing is what you hold

Traversal carries the standing you already have; it does not grant one. A junior
at project level holds `viewers` there and writes nothing beneath it. Only an
editor or better reaches down.

So the rule for granting is: put the standing where you mean it. `editors` at
project level means editor across every team on that project, and if someone
should edit one team's work only, their standing belongs on that team.

The one consequence worth knowing is that an editor-or-better on a project can
edit inside a contractor's model. That is deliberate, and it is the only
traversal worth arguing about, because a contractor signs off on their own
deliverable. It can be turned off by dropping one line from `write` in the OPL:
`manage` and `admin` keep traversing, so onboarding, handover, freezing and
deletion are unaffected, and anyone who needs to edit a contractor's work takes
an explicit `editors` tuple that shows up in the member list and the audit log.

## Writes go over HTTP, checks do not

A check runs on every row of every request. Over HTTP that rebuilds the N+1
problem the model exists to avoid, so checks are an in-process call and only
mutations are an API.

### People

```
POST    /groups/:id/members              { subject, standing }
PATCH   /groups/:id/members/:subject     { standing }
DELETE  /groups/:id/members/:subject
GET     /groups/:id/members
```

`PATCH` is load-bearing. Promoting is delete-then-write, atomically: writing
`editors` without removing `viewers` leaves the person holding both, which reads
as a promotion that did not take.

### Group to group

```
POST    /groups/:id/grants               { standing, from: { group, standing } }
DELETE  /groups/:id/grants/:standing/:from/:fromStanding
GET     /groups/:id/grants
```

Kept separate from members on purpose. They look alike and are different
decisions, and a single polymorphic `subject` field makes both the authorization
rules and the audit entries mushy.

### Children

```
POST    /groups/:id/children             { name, type }
```

Creating a child and deciding whether it joins the roster are two ordinary
operations, not one compound endpoint. **A private area is a child that never
joined**: the privacy is the missing grant, not a kind of thing, which is why
there is no `type: workspace` and no `/workspace` route. A child of a team, of a
project, or of an org all work the same way.

### The one composed operation that earns its place

```
POST    /groups/:id/onboard              { name, type, lead }
```

Onboarding a contractor is a child group, the lead's standing, three roster
joins and a row. It has to be all-or-nothing, which a client cannot guarantee by
calling four endpoints in sequence.

## Checks

```ts
can(subject, "write", row.groupId)
canAll(subject, "write", distinct(groupIds))   // a changeset: dedupe first,
                                                   // so 5,000 nodes is 2–3 checks
readableGroups(subject)                       // a list: resolve once, then
                                                   // WHERE group_id IN (...)
```

`readableGroups` is the one to watch. It is Keto's reverse direction, which
is where Zanzibar implementations are weakest, so back it with the Postgres
membership index and keep Keto for the point checks on the write path.

Cache all three per request. Caching across requests is where revocation latency
becomes a security question rather than a performance one.

## Two things only the write path can own

**The escalation guard**, immediately before every tuple write: the target
standing must be strictly below the granter's own. This is why a UI cannot talk
to Keto directly. Each one would reimplement it, and the one that gets it wrong
lets a manager mint another manager.

**The audit row**, in the same transaction. `Group:t-acme#editors@fischer`
records no actor, no timestamp and no reason, so "who made Fischer an editor, and
when" is unanswerable from Keto alone.

Both live in one place, and every endpoint above funnels through it.

## Open

Where this service lives. Keto is deployed in this repository and is deliberately
unroutable, but groups are the platform's own domain and `group_id` sits
on the platform's rows. Either the platform reaches Keto across projects, or this
repository exposes an authenticated API and the platform consumes it.

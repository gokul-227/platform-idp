# 10. Contributing

## Purpose

This chapter is the contribution guide for this repository: what to read before opening a change,
the change-discipline rules that apply to a security-sensitive identity platform, and the local
workflow for validating a change before you propose it.

## Overview

This repository is an Ory-based identity platform. Treat every change to identity schemas, Ory
configuration, secrets handling, authorization policy, or ingress routing as security-sensitive.

## Before opening a change

1. Read [chapter 9 — Architecture](../09-architecture/README.md) first, especially
   [Current state](../09-architecture/README.md#current-state--what-this-platform-actually-is-today)
   — it's the single source of truth for "what's actually true right now" in this repository. The
   historical governance documents summarized in that same chapter (an early repository audit, an
   implementation roadmap, later audit/reset reports) are kept for historical context only — don't
   treat their specific claims as current without cross-checking the current-state section first.
2. Do not build a custom authentication UI, administration portal, or demo application from
   scratch. Integrate pinned upstream projects according to
   [ADR-0011](../09-architecture/README.md#adr-0011-adopt-pinned-upstream-projects-instead-of-a-custom-admin-ui-or-demo-apps)'s
   adoption gate — see that ADR's own note for the one disclosed, deliberate exception
   (`identity-ui` itself) and why it doesn't contradict this rule.
3. Never commit `.env`, credentials, generated certificates, private keys, Terraform state, or
   vendor dependency directories.
4. Run `make validate` before opening a pull request.

## Change discipline

- Keep Ory, Docker, Compose, Kubernetes, Helm, Terraform, PostgreSQL, and Redis as the platform
  foundations.
- Prefer narrowly scoped, reversible changes. Update configuration, tests, and docs together.
- Do not expose Ory admin APIs publicly. Administrative clients require a separate protected
  boundary — see [chapter 8's security guide](../08-reference/README.md#security-guide) and
  [chapter 7's production hardening section](../07-operations/README.md#production-hardening--an-honest-inventory).
- Pin every adopted upstream application by immutable release or digest and record its license,
  provenance, upgrade plan, and security review.
- Follow the two standing architecture mandates for any new custom code: **Python-first**
  ([ADR-0012](../09-architecture/README.md#adr-0012--python-as-the-standard-language-for-custom-platform-tooling))
  and **container-first, no local venv/pip**
  ([ADR-0013](../09-architecture/README.md#adr-0013--container-first-python-development-no-local-venvpip))
  — see [chapter 5](../05-development/README.md) for what this means in practice when adding a new
  service or console page.
- Don't add stub plugins, placeholder nav entries, or speculative config surfaces for a category
  with no real second use case yet — this repository has an explicit, repeatedly-enforced
  "no placeholders" rule (see [chapter 5's plugin section](../05-development/README.md#plugins) for
  what this looks like in practice).
- When a decision changes an existing architectural choice, write a new
  [ADR](../09-architecture/README.md#architecture-decision-records) rather than editing the old one
  — mark the old one `Superseded by ADR-XXXX`.

### Creating a new ADR

ADRs live as entries inside [chapter 9's Architecture Decision Records section](../09-architecture/README.md#architecture-decision-records)
rather than as separate files, following this restructure. To record a new one:

1. Use the next unused number after the highest ADR in
   [chapter 9's index](../09-architecture/README.md#index) (skipped numbers like ADR-0006–ADR-0010
   are not reused).
2. Follow the same shape every existing ADR in that section uses:
   ```
   ### ADR-XXXX: Title

   **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
   **Date:** YYYY-MM-DD
   **Deciders:** [team / person]

   #### Context        — the problem and the alternatives considered
   #### Decision        — the option that was chosen
   #### Consequences    — Positive: / Negative: trade-offs that follow from the decision
   ```
3. Add the new ADR as a subsection alongside the others, and add a row for it to the index table.
4. If this decision changes an earlier one, mark the earlier ADR `Superseded by ADR-XXXX` in
   place — do not edit its Context/Decision/Consequences to match the new reality (see
   [ADR-0003/ADR-0011](../09-architecture/README.md#adr-0011-adopt-pinned-upstream-projects-instead-of-a-custom-admin-ui-or-demo-apps)
   for the precedent).

## Local workflow

```bash
cp .env.example .env
automation/setup/generate-secrets.sh .env
make validate
./automation/platform doctor
```

`platform up` is not considered successful until health checks pass (see
[chapter 7 — Checking health](../07-operations/README.md#checking-health)). Feature work must add
automated checks for its public contract — see
[chapter 5's testing conventions](../05-development/README.md#4-testing-conventions) for where a
new unit, integration, e2e, security, or smoke test belongs.

## FAQ

**Where do I find the endpoint reference for an existing service before I extend it?**
[Chapter 5's API reference](../05-development/README.md#api-reference) — every service's own live
`/openapi.json` is the final authority if this page ever drifts from it.

**Can I introduce a new language for a platform service?** No — see
[ADR-0012](../09-architecture/README.md#adr-0012--python-as-the-standard-language-for-custom-platform-tooling).
Every custom `platform/*` service is Python/FastAPI.

**Do I need a local Python/Node install to contribute?** No — see
[ADR-0013](../09-architecture/README.md#adr-0013--container-first-python-development-no-local-venvpip).
Every lint/test/build command runs inside a Docker container.

## Common mistakes

- Re-auditing the repository from scratch instead of reading
  [chapter 9's current-state section](../09-architecture/README.md#current-state--what-this-platform-actually-is-today)
  first.
- Building a new custom UI or admin portal instead of integrating a pinned upstream project.
- Committing `.env`, generated certificates, or Terraform state.
- Adding a stub plugin or placeholder config surface "to be thorough."
- Skipping `make validate` before opening a pull request.

## References / Related pages

- [Chapter 9 — Architecture](../09-architecture/README.md) — the current-state section, every ADR,
  and the two standing architecture mandates referenced throughout this chapter
- [Chapter 5 — Development](../05-development/README.md) — the container-first workflow, testing
  conventions, and the full API reference
- [Chapter 7 — Operations](../07-operations/README.md) — health checks and the production-hardening
  inventory
- [Chapter 8 — Reference](../08-reference/README.md) — the security guide's non-negotiable controls

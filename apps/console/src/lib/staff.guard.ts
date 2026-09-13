// The console's gate, deliberately unpublished: an app that needs a session
// cookie should register as an OAuth client instead
// (@aec-craft/platform-id-client-nextjs). Wired in src/proxy.ts.

import {
  refusalCodeFor,
  type StaffGuardDenialReason,
} from "@aec-craft/platform-id-contracts/guard/guard.denials";
import type { IdentityFacts } from "@aec-craft/platform-id-contracts/identity/identity.traits";
import {
  displayNameOf,
  emailOf,
  isRoot,
  isStaff,
  staffRoleValueOf,
} from "@aec-craft/platform-id-sdk/identity";
import { after, type NextRequest, NextResponse } from "next/server";
import { configuredRoots } from "./roots";
import {
  type ResolvedGuardOptions,
  resolveGuardOptions,
  type StaffGuardOptions,
} from "./staff.guard.options";

export type { StaffGuardDenialReason } from "@aec-craft/platform-id-contracts/guard/guard.denials";
export type { StaffGuardOptions } from "./staff.guard.options";

/** The `/sessions/whoami` fields the four conditions are read from. */
interface SessionFacts {
  authenticator_assurance_level?: string;
  identity?: IdentityFacts;
}

const LOG_PREFIX = "[console/staff.guard]";

/** Where the operator was heading, for whatever we bounce them through. */
function returnTo(request: NextRequest, options: ResolvedGuardOptions): string {
  return new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    options.appUrl
  ).toString();
}

/**
 * First `x-forwarded-for` entry is the original client. Read off
 * `request.headers`: edge middleware has no Server Component request context,
 * so `next/headers` cannot answer here.
 */
function requestIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}

/**
 * Somebody with a session the console refuses. `no-session` is excluded: the
 * matcher covers every path, so recording it lets any caller write audit rows
 * without a session.
 */
const RECORDED_DENIALS: ReadonlySet<StaffGuardDenialReason> = new Set([
  "not-staff",
  "no-role",
  "unknown-role",
  "session-invalid",
]);

/**
 * `after`, not a bare un-awaited fetch: middleware can be torn down with the
 * response and drop a promise nothing holds. No secret configured means no
 * request at all.
 */
function recordDenial(
  request: NextRequest,
  options: ResolvedGuardOptions,
  reason: StaffGuardDenialReason,
  identity?: IdentityFacts | null
): void {
  if (!(options.auditHookSecret && RECORDED_DENIALS.has(reason))) {
    return;
  }
  const secret = options.auditHookSecret;
  after(async () => {
    try {
      await fetch(options.auditHookUrl, {
        body: JSON.stringify({
          resource: "console_access",
          verb: "denied",
          actorType: "user",
          actorEmail: identity ? emailOf(identity) || null : null,
          actorIdentityId: identity?.id ?? null,
          actorName: identity ? displayNameOf(identity) || null : null,
          context: { reason },
          ip: requestIp(request),
          status: "denied",
          userAgent: request.headers.get("user-agent"),
        }),
        headers: {
          "content-type": "application/json",
          "x-audit-token": secret,
        },
        method: "POST",
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} failed to record denial`, error);
    }
  });
}

/**
 * Precise reason to the log, coarse code to the response: a response header is
 * published, so it carries only what the visitor may know.
 */
function deny(
  request: NextRequest,
  response: NextResponse,
  options: ResolvedGuardOptions,
  reason: StaffGuardDenialReason,
  identity?: IdentityFacts | null
): NextResponse {
  console.info(`${LOG_PREFIX} refused: ${reason}`);
  const code = refusalCodeFor(reason);
  if (code) {
    response.headers.set(options.deniedHeader, code);
  }
  recordDenial(request, options, reason, identity);
  return response;
}

/** No session, or one Kratos no longer recognises: signing in fixes it. */
function toSignIn(
  request: NextRequest,
  options: ResolvedGuardOptions,
  reason: StaffGuardDenialReason
): NextResponse {
  const signIn = new URL(options.signInUrl);
  signIn.searchParams.set("return_to", returnTo(request, options));
  return deny(request, NextResponse.redirect(signIn), options, reason);
}

/**
 * A session below the floor, enrolled or not: `whoami` reports the level a
 * session reached, never the levels its identity could reach. Kratos serves the
 * step-up flow either way, and the sign-in app renders what it gets.
 */
function toStepUp(
  request: NextRequest,
  options: ResolvedGuardOptions,
  reason: StaffGuardDenialReason
): NextResponse {
  const stepUp = new URL(options.stepUpUrl);
  stepUp.searchParams.set("aal", options.requiredAal);
  stepUp.searchParams.set("return_to", returnTo(request, options));
  return deny(request, NextResponse.redirect(stepUp), options, reason);
}

/** A dead end: never a redirect into an auth flow, which is where a loop comes from. */
function toDenied(
  request: NextRequest,
  options: ResolvedGuardOptions,
  reason: StaffGuardDenialReason,
  identity?: IdentityFacts | null
): NextResponse {
  const denied = new URL(options.deniedUrl);
  const code = refusalCodeFor(reason);
  if (code) {
    denied.searchParams.set("code", code);
  }
  return deny(
    request,
    NextResponse.redirect(denied),
    options,
    reason,
    identity
  );
}

/** Kratos answers 403 with this id when the session may still step up. */
async function isStepUpRequired(
  response: Response,
  options: ResolvedGuardOptions
): Promise<boolean> {
  if (response.status !== 403) {
    return false;
  }
  try {
    const body = (await response.json()) as { error?: { id?: string } };
    return body.error?.id === options.stepUpErrorId;
  } catch {
    return false;
  }
}

/**
 * The identity half of the decision, or null when it passes. Only what no auth
 * flow can change; the caller settles the assurance level.
 */
function refuseIdentity(
  session: SessionFacts,
  config: ResolvedGuardOptions
): StaffGuardDenialReason | null {
  // Admitted on configuration alone, so nothing in Kratos can strand the
  // break-glass account. The assurance floor the caller applies still holds,
  // which is what keeps it from being a backdoor.
  if (!isRoot(session.identity, configuredRoots())) {
    if (config.schema !== null && !isStaff(session.identity, config.schema)) {
      return "not-staff";
    }
    if (config.roles !== null) {
      const role = staffRoleValueOf(session.identity);
      if (!role) {
        return "no-role";
      }
      if (!config.roles.includes(role)) {
        return "unknown-role";
      }
    }
  }
  return null;
}

/**
 * A floor, not an equality: a session that stepped higher still passes. An
 * unrecognised spelling falls back to equality rather than guessing an order.
 */
const AAL_PATTERN = /^aal(\d+)$/;

function aalRank(value?: string): number | null {
  const match = AAL_PATTERN.exec(value ?? "");
  return match?.[1] ? Number(match[1]) : null;
}

function meetsAal(actual: string | undefined, required: string): boolean {
  const actualRank = aalRank(actual);
  const requiredRank = aalRank(required);
  if (actualRank === null || requiredRank === null) {
    return actual === required;
  }
  return actualRank >= requiredRank;
}

/**
 * The gate: a session, then schema and role (both optional), then the assurance
 * floor, which is answered with step-up rather than refusal. The consumer's
 * matcher must leave `/denied` and `/logout` outside it or nothing can reach them.
 */
/** `NextResponse.next()` carrying who was admitted, for whatever runs after the gate. */
export type Admission = NextResponse & { subject?: string };

export function createSessionGuard(
  options: StaffGuardOptions = {}
): (request: NextRequest) => Promise<Admission> {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const config = resolveGuardOptions(options);

    const cookie = request.headers.get("cookie");
    if (!cookie) {
      return toSignIn(request, config, "no-session");
    }

    let session: SessionFacts;
    try {
      const response = await fetch(
        `${config.kratosPublicUrl}/sessions/whoami`,
        { cache: "no-store", headers: { cookie } }
      );
      if (!response.ok) {
        return (await isStepUpRequired(response, config))
          ? toStepUp(request, config, "aal-step-up-required")
          : toSignIn(request, config, "session-invalid");
      }
      session = (await response.json()) as SessionFacts;
    } catch (error) {
      // Fail closed, and log it: the operator sees only "cannot verify your
      // session", which a wrong URL, DNS and an expired certificate all produce.
      // Message only, because the request carries a session cookie.
      console.error(
        `${LOG_PREFIX} whoami unreachable at ${config.kratosPublicUrl}:`,
        error instanceof Error ? error.message : error
      );
      return toDenied(request, config, "session-unavailable");
    }

    const refusal = refuseIdentity(session, config);
    if (refusal) {
      return toDenied(request, config, refusal, session.identity);
    }
    // Never a dead end: `whoami.required_aal` is `aal1` (ory/kratos/kratos.yml),
    // so an enrolled session that has not stepped up and one with nothing
    // enrolled both arrive here as a truthful `aal1`.
    if (!meetsAal(session.authenticator_assurance_level, config.requiredAal)) {
      return toStepUp(request, config, "aal-step-up-required");
    }
    return Object.assign(NextResponse.next(), {
      subject: session.identity?.id,
    });
  };
}

/**
 * The operator preset: the staff schema, this platform's roles, aal2. Every
 * default already says this; it names the intent, and keeps the role vocabulary
 * out of call sites that would pin an older list.
 */
export function createStaffSessionGuard(
  options: StaffGuardOptions = {}
): (request: NextRequest) => Promise<Admission> {
  return createSessionGuard(options);
}

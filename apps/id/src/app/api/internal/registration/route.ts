import {
  mayRegister,
  type RegistrationPolicy,
  registrationPolicy,
} from "@aec-craft/platform-id-contracts/identity/registration.domains";
import { type NextRequest, NextResponse } from "next/server";

/**
 * The registration gate, called from an interrupting hook on the registration
 * flow. Here rather than as a schema `pattern`, which binds every flow validating
 * traits and so stopped the console creating anyone.
 *
 * No shared secret, unlike the audit receiver: this reads and writes nothing, and
 * forging an allow means sitting between Kratos and this app, which a header does
 * not sign against. Reachability is the lever if it ever needs one.
 */

/**
 * Kratos reads this shape off a 403 and renders the message against the field
 * it names, so the person sees it under the email box rather than as a banner
 * with no cause.
 */
function refusal(policy: RegistrationPolicy): NextResponse {
  // Names the domains when there are any. With none there is nothing true to
  // say about which addresses would work, so it says the other true thing.
  const text =
    policy.open || policy.domains.length === 0
      ? "Registration is not open. Ask an administrator for an account."
      : `Registration is open to ${policy.domains.join(" and ")} addresses. Ask an administrator for an account.`;
  return NextResponse.json(
    {
      messages: [
        {
          instance_ptr: "#/traits/email",
          messages: [{ id: 4_000_001, text, type: "error" }],
        },
      ],
    },
    { status: 403 }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const policy = registrationPolicy(
    process.env.REGISTRATION_OPEN,
    process.env.REGISTRATION_ALLOWED_DOMAINS
  );

  // A closed policy with nothing to allow refuses everybody, which is a mistake
  // rather than a decision, and from outside it looks like an unlisted domain.
  if (!(policy.open || policy.domains.length > 0)) {
    console.error(
      "[registration] refusing every registration: REGISTRATION_ALLOWED_DOMAINS is empty and REGISTRATION_OPEN is not true"
    );
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return refusal(policy);
  }

  // An unreadable address is refused rather than passed: this runs only for
  // self-service registration, where the address is the identifier being
  // claimed, and "could not tell" is not a reason to admit it.
  const email = typeof body.email === "string" ? body.email : "";
  if (!(email && mayRegister(email, policy))) {
    return refusal(policy);
  }

  return NextResponse.json({});
}

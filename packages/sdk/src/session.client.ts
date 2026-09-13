// The buildOS ID facts a consumer reads: the session, its identity's traits and
// role, and a logout URL. Deliberately not a wrapper around the Ory API, which is
// a peer dependency here, so everything outside this surface is one `FrontendApi`
// away rather than behind a re-declaration that owns the drift.
//
// The identity vocabulary is a second entry point with no runtime imports.

import {
  Configuration,
  FrontendApi,
  type Identity,
  type Session,
} from "@ory/client-fetch";
import {
  displayNameOf,
  emailOf,
  type IdentityTraits,
  isStaff,
  type StaffRole,
  staffRoleOf,
  traitsOf,
} from "./identity";

export type { IdentityTraits, StaffRole } from "./identity";

export interface IdClientOptions {
  /** Kratos's public base URL. The frontend API; never the admin one. */
  kratosPublicUrl: string;
  /** Schema that marks an identity as staff, if a deployment renames it. */
  staffSchema?: string;
}

/**
 * Who is signed in, from one `/sessions/whoami` call. Derived once rather than
 * at each call site, because every derivation done separately costs another
 * round trip to Kratos.
 */
export interface Viewer {
  /** `aal1` or `aal2`: whether this session used a second factor. */
  assuranceLevel: string | null;
  email: string;
  id: string;
  identity: Identity;
  isStaff: boolean;
  /** Name, else address, else id. Never empty. */
  name: string;
  session: Session;
  /** Null for an unrecognised role, exactly as for no role at all. */
  staffRole: StaffRole | null;
  traits: IdentityTraits;
}

export interface IdClient {
  /** Kratos mints a per-session logout token, so only Kratos can build this URL. */
  getLogoutUrl(cookie: string): Promise<string | null>;
  getSession(cookie: string): Promise<Session | null>;
  getViewer(cookie: string): Promise<Viewer | null>;
}

/**
 * Every call takes the request's `Cookie` header rather than reading one. The
 * session is a cookie Kratos set, and staying out of any framework's request
 * store lets the same client serve a server component, a route handler and a
 * script.
 */
export function createIdClient(options: IdClientOptions): IdClient {
  const frontend = new FrontendApi(
    new Configuration({ basePath: options.kratosPublicUrl })
  );

  async function getSession(cookie: string): Promise<Session | null> {
    try {
      return await frontend.toSession({ cookie });
    } catch {
      // Null covers every refusal, including the 403 a session that could still
      // step up answers with. Telling those apart is an authorization decision
      // and belongs in a guard, not in a reader.
      return null;
    }
  }

  return {
    getSession,

    async getViewer(cookie: string): Promise<Viewer | null> {
      const session = await getSession(cookie);
      const identity = session?.identity;
      if (!(session && identity)) {
        return null;
      }
      return {
        assuranceLevel: session.authenticator_assurance_level ?? null,
        email: emailOf(identity),
        id: identity.id,
        identity,
        isStaff: isStaff(identity, options.staffSchema),
        name: displayNameOf(identity),
        session,
        staffRole: staffRoleOf(identity),
        traits: traitsOf(identity),
      };
    },

    async getLogoutUrl(cookie: string): Promise<string | null> {
      try {
        const flow = await frontend.createBrowserLogoutFlow({ cookie });
        return flow.logout_url;
      } catch {
        return null;
      }
    },
  };
}

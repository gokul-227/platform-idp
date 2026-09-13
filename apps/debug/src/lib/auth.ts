import "server-only";

import { createIdClient } from "@aec-craft/platform-id-client-nextjs";

/**
 * This app as an OAuth client of buildOS ID, with the id and secret from the
 * console's Applications page, so registering an app is a console action. The
 * console itself uses a session guard instead, sharing a cookie domain and
 * holding no credential; this works from any origin.
 */
export const auth = createIdClient();

import { platformAuth } from "@/lib/platform.auth";

/**
 * The relay: `/api/orgs` reaches the platform as `/orgs` with the person's own
 * token attached, so the token never reaches the browser. The SDK client in
 * `platform.providers.tsx` points here. `api/internal/*` is more specific and
 * stays this app's own.
 */
const forward = platformAuth.handlers.forward;

export const GET = forward.GET;
export const POST = forward.POST;
export const PUT = forward.PUT;
export const PATCH = forward.PATCH;
export const DELETE = forward.DELETE;

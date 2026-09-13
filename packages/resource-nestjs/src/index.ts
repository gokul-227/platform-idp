/**
 * How a NestJS API trusts a caller of buildOS ID: one signature against the
 * issuer's published keys, and the claims it stamped. It never calls the identity
 * service, so it answers while that service is down.
 *
 * Authentication only. Whether this caller may touch this row is answered against
 * the row's group, which needs a row read and cannot live in a guard.
 */
export { CurrentPrincipal } from "./current-principal.decorator";
export { PlatformIdModule } from "./platform-id.module";
export {
  meetsAal,
  type Principal,
  type PrincipalType,
  toPrincipal,
} from "./principal";
export { PrincipalGuard, Public, RequireAal } from "./principal.guard";
export { TOKEN_VERIFIER } from "./tokens";
export {
  bearerFrom,
  createVerifier,
  resolveVerifierOptions,
  type VerificationFailure,
  type VerificationResult,
  type VerifierOptions,
} from "./verifier";

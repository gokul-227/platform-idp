import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Principal } from "./principal";

/**
 * The verified caller, for a handler that needs it.
 *
 * Typed non-nullable because `PrincipalGuard` has already run by the time a
 * handler executes: on a gated route there is always a principal, and on a
 * `@Public()` route asking for one is the mistake rather than the absence.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal =>
    context.switchToHttp().getRequest<{ principal: Principal }>().principal
);

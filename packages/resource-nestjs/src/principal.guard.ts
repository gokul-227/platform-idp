import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { meetsAal } from "./principal";
import { PUBLIC_ROUTE, REQUIRED_AAL, TOKEN_VERIFIER } from "./tokens";
import { bearerFrom, type VerificationResult } from "./verifier";

const LOG_PREFIX = "[@aec-craft/platform-id-resource-nestjs]";

/** Opts a route out of the gate. Health probes and metadata documents. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE, true);

/**
 * Raises the assurance floor for one route or controller. The default is `aal0`,
 * which is "any verified caller": a service account has no assurance level to
 * offer, so demanding one everywhere would refuse every machine.
 */
export const RequireAal = (aal: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_AAL, aal);

/**
 * The only authentication in the API: one signature against the issuer's published
 * keys, then the principal, never a call to the identity service.
 *
 * Authentication only. Whether this caller may touch this row is answered against
 * the row's group, which needs a row read: a guard that reads rows lies about when
 * it runs.
 */
@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    // Explicit rather than reflected: inferring it needs `emitDecoratorMetadata`,
    // which esbuild and SWC do not emit, so a consumer not building with tsc gets
    // "can't resolve dependencies (?, ...)" at boot.
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER)
    private readonly verify: (
      token: string | undefined
    ) => Promise<VerificationResult>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const result = await this.verify(bearer(request));
    if (!result.ok) {
      // The reason is logged and never returned: it distinguishes a forged
      // signature from an expired one from a token minted for another service,
      // which is exactly the map an attacker wants.
      console.warn(`${LOG_PREFIX} refused a request: ${result.reason}`);
      throw new UnauthorizedException();
    }

    const required =
      this.reflector.getAllAndOverride<string>(REQUIRED_AAL, targets) ?? "aal0";
    if (!meetsAal(result.principal.aal, required)) {
      console.warn(
        `${LOG_PREFIX} refused a request: aal ${result.principal.aal} below ${required}`
      );
      throw new UnauthorizedException();
    }

    request.principal = result.principal;
    return true;
  }
}

interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: unknown;
}

function bearer(request: GuardedRequest): string | undefined {
  const header = request.headers.authorization;
  return bearerFrom(typeof header === "string" ? header : undefined);
}

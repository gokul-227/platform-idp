import { type DynamicModule, Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrincipalGuard } from "./principal.guard";
import { TOKEN_VERIFIER } from "./tokens";
import { createVerifier, type VerifierOptions } from "./verifier";

/**
 * `PlatformIdModule.forRoot()` in the root module, with the guard global via
 * `APP_GUARD`, so a new controller is protected by default and opting out is the
 * visible act. A per-controller guard is one somebody forgets on the controller
 * that matters.
 */
@Module({})
export class PlatformIdModule {
  static forRoot(options: VerifierOptions = {}): DynamicModule {
    return {
      module: PlatformIdModule,
      global: true,
      providers: [
        // Built once for the process. The instance holds the key-set cache, so
        // a per-request verifier would refetch the keys on every request.
        { provide: TOKEN_VERIFIER, useValue: createVerifier(options) },
        // The guard reads route metadata, so it needs a Reflector in whatever
        // module constructs it. An app that registers the guard through
        // APP_GUARD gets one from the core module and would never notice this
        // missing; anything resolving the guard directly cannot construct it.
        Reflector,
        PrincipalGuard,
      ],
      exports: [TOKEN_VERIFIER, PrincipalGuard],
    };
  }
}

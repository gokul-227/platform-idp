/**
 * The shape every error catalog here satisfies, mirroring the platform monorepo's
 * `PlatformErrorSpec` so a code travelling between the two means the same thing.
 * `status` is optional and stated only where a surface returns one: refusals here
 * travel as a query parameter or a response header, which no status describes.
 */
export interface PlatformErrorSpec {
  /** Stable wire identifier. Append-only contract. */
  code: string;
  /** Longer explanation, suitable for showing to an operator. */
  description: string;
  /** Short human-readable title. */
  name: string;
  /** HTTP status, where an HTTP surface returns one. */
  status?: number;
}

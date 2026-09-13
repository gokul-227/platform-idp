/**
 * No `output: "standalone"` and no security headers: this app is never built
 * into an image and never served anywhere but a developer's machine. Adding
 * either would imply it is deployable, which is the one thing it is not.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // @aec-craft/ui ships raw .tsx/.ts (source exports), so Next must transpile it.
  transpilePackages: ["@aec-craft/ui"],
};

export default nextConfig;

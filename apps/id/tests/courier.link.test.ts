import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The one-click link's origin allowlist, which is that feature's whole security
 * boundary: `flow_url` is browser-submitted, so anyone who can trigger a code
 * proposes where the mail points. Read out of the templates rather than restated,
 * so this tests what ships; RE2 and JavaScript agree on everything it uses.
 */
const TEMPLATE_DIR = join(
  import.meta.dirname,
  "../../../ory/kratos/courier-templates/login_code/valid"
);

const HTML = join(TEMPLATE_DIR, "email.body.gotmpl");
const PLAINTEXT = join(TEMPLATE_DIR, "email.body.plaintext.gotmpl");

/** The pattern out of a template's `regexMatch` call, backticks and all. */
function allowlistOf(path: string): string {
  const source = readFileSync(path, "utf8");
  const match = source.match(/regexMatch\s+`([^`]+)`/);
  if (!match?.[1]) {
    throw new Error(`no regexMatch pattern found in ${path}`);
  }
  return match[1];
}

const FLOW = "0192f3a1-2b3c-4d5e-8f90-a1b2c3d4e5f6";

describe("the two templates", () => {
  it("carry the same allowlist", () => {
    // They render the same link into two bodies of one mail. A pattern edited
    // in one and not the other would offer the button in HTML and refuse it in
    // plaintext, or worse the other way round, and nothing else would say so.
    expect(allowlistOf(HTML)).toBe(allowlistOf(PLAINTEXT));
  });
});

describe("the origin allowlist", () => {
  const pattern = new RegExp(allowlistOf(HTML));
  const matches = (url: string): boolean => pattern.test(url);

  it("admits the sign-in origins this estate actually has", () => {
    expect(matches(`https://id.os.build/login?flow=${FLOW}`)).toBe(true);
    expect(matches(`https://dev.id.os.build/login?flow=${FLOW}`)).toBe(true);
    expect(matches(`https://test.id.os.build/login?flow=${FLOW}`)).toBe(true);
    expect(matches(`http://localhost:3200/login?flow=${FLOW}`)).toBe(true);
  });

  it("refuses a host smuggled through userinfo", () => {
    // https://id.os.build@evil.com/ is a request to evil.com, and reads as ours.
    expect(matches(`https://id.os.build@evil.com/login?flow=${FLOW}`)).toBe(
      false
    );
  });

  it("refuses a subdomain that is not one of ours", () => {
    expect(matches(`https://evil.id.os.build/login?flow=${FLOW}`)).toBe(false);
  });

  it("refuses a domain that merely contains ours", () => {
    expect(matches(`https://id.os.build.evil.com/login?flow=${FLOW}`)).toBe(
      false
    );
    expect(matches(`https://evilid.os.build/login?flow=${FLOW}`)).toBe(false);
  });

  it("refuses anything appended after the flow id", () => {
    // The code is appended as a fragment, so a URL that can carry its own
    // query or fragment can carry the code somewhere else.
    expect(
      matches(`https://id.os.build/login?flow=${FLOW}&next=https://evil.test`)
    ).toBe(false);
    expect(matches(`https://id.os.build/login?flow=${FLOW}#@evil.test`)).toBe(
      false
    );
  });

  // The login page states the challenge in its own address, which invites
  // appending it here too. It must not be: whoever asks for a code proposes
  // `flow_url`, so a challenge accepted here mails a genuine sign-in link bound
  // to an authorize request the sender controls.
  it("refuses a login challenge appended to the mailed link", () => {
    expect(
      matches(`https://id.os.build/login?flow=${FLOW}&login_challenge=abc123`)
    ).toBe(false);
  });

  it("refuses a path that is not the login flow", () => {
    expect(matches(`https://id.os.build/evil?flow=${FLOW}`)).toBe(false);
    expect(matches(`https://id.os.build/login/../evil?flow=${FLOW}`)).toBe(
      false
    );
  });

  it("holds each origin to its own scheme", () => {
    // Plaintext to a real host would put the code on the wire; TLS to
    // localhost is not what the dev stack serves.
    expect(matches(`http://id.os.build/login?flow=${FLOW}`)).toBe(false);
    expect(matches(`https://localhost:3200/login?flow=${FLOW}`)).toBe(false);
    expect(matches(`http://localhost:9999/login?flow=${FLOW}`)).toBe(false);
  });

  it("refuses a scheme that is not a URL at all", () => {
    expect(matches(`javascript:alert(1)//id.os.build/login?flow=${FLOW}`)).toBe(
      false
    );
  });

  it("refuses characters that would break out of the href attribute", () => {
    expect(matches(`https://id.os.build/login?flow=${FLOW}" onclick="x`)).toBe(
      false
    );
    expect(matches(`https://id.os.build/login?flow=${FLOW}\nX`)).toBe(false);
  });

  it("refuses an absent or empty payload", () => {
    expect(matches("")).toBe(false);
  });

  it("is case-sensitive about the host, since the pattern spells it out", () => {
    // The domain is written in character classes rather than with a flag, so
    // this documents that the rest of the URL is not folded either.
    expect(matches(`https://ID.OS.BUILD/login?flow=${FLOW}`)).toBe(false);
  });
});

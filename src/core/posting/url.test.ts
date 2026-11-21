import { describe, expect, it } from "vitest";
import { checkPostingUrl, hostOf, isPublicAddress, parseLink, PRIVATE_ADDRESS, webAddress } from "./url";

const refused = (link: string) => {
  const check = checkPostingUrl(link);
  return check.ok ? null : check.reason;
};

describe("parseLink", () => {
  it("accepts http and https links, ignoring spaces around them", () => {
    const parsed = parseLink("  https://jobs.example.com/backend-engineer?id=7 ");
    expect(parsed.ok && parsed.url.href).toBe("https://jobs.example.com/backend-engineer?id=7");
    expect(parseLink("http://jobs.example.com").ok).toBe(true);
  });

  it("refuses other protocols and text that is not a link", () => {
    for (const link of ["ftp://example.com/job", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,job"]) {
      expect(parseLink(link)).toEqual({ ok: false, reason: "Only http and https links are accepted." });
    }
    for (const link of ["", "backend engineer", "jobs.example.com/7"]) {
      expect(parseLink(link)).toMatchObject({ ok: false, reason: expect.stringContaining("not a link") });
    }
  });
});

describe("checkPostingUrl", () => {
  it("accepts a link to a public name or address", () => {
    for (const link of ["https://jobs.example.com/7", "http://93.184.216.34/job", "https://[2606:2800:220:1::1]/job"]) {
      expect(refused(link)).toBeNull();
    }
  });

  it("refuses loopback, private and link-local addresses, however they are written", () => {
    const links = [
      "http://localhost:3000/",
      "http://app.localhost/",
      "http://LOCALHOST./",
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f.0.0.1/",
      "http://0.0.0.0/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:192.168.0.1]/",
      "http://[64:ff9b::10.0.0.1]/",
    ];
    for (const link of links) expect(refused(link), link).toBe(PRIVATE_ADDRESS);
  });

  it("refuses other protocols before looking at the address", () => {
    expect(refused("ftp://127.0.0.1/")).toBe("Only http and https links are accepted.");
  });
});

describe("isPublicAddress", () => {
  it("tells public addresses from the ones a name must not resolve to", () => {
    for (const address of ["93.184.216.34", "172.15.0.1", "172.32.0.1", "2606:2800:220:1::1", "::ffff:93.184.216.34"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    const others = [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.10",
      "169.254.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fe80::1%en0",
      "fc00::1",
      "ff02::1",
      "::ffff:10.0.0.1",
      "::ffff:a00:1",
    ];
    for (const address of others) expect(isPublicAddress(address), address).toBe(false);
  });

  it("is false for anything that isn't an address", () => {
    for (const text of ["", "example.com", "1.2.3", "1.2.3.256", "1::2::3", "12345::1"]) {
      expect(isPublicAddress(text), text).toBe(false);
    }
  });
});

describe("hostOf", () => {
  it("gives the host without brackets, trailing dot or capitals", () => {
    expect(hostOf(new URL("https://Jobs.Example.com./x"))).toBe("jobs.example.com");
    expect(hostOf(new URL("http://[::1]:8080/"))).toBe("::1");
  });
});

describe("webAddress", () => {
  it("keeps only http and https addresses", () => {
    expect(webAddress(" https://globex.example ")).toBe("https://globex.example/");
    expect(webAddress("HTTP://Globex.example/a")).toBe("http://globex.example/a");
    for (const value of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "vbscript:x", "mailto:a@b.c", "globex.example", "", 42, null]) {
      expect(webAddress(value), String(value)).toBeUndefined();
    }
  });
});

// SSRF protection for server-side fetches of user-supplied URLs (webhooks, gateway judge).
// Resolves the host and rejects private/loopback/link-local/metadata addresses so a user
// can't make the server probe internal services (e.g. 169.254.169.254, 127.0.0.1, RFC1918).
//
// Note: this validates at call time. For full DNS-rebinding safety you'd also pin the
// resolved IP for the connection; this guard + redirect:"manual" at the call sites covers
// the common cases. Always pass { redirect: "manual" } and re-validate any Location.
import { lookup } from "node:dns/promises";
import net from "node:net";

function v4ToInt(ip) { return ip.split(".").reduce((a, o) => ((a << 8) + Number(o)) >>> 0, 0); }
function inV4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}
// RFC1918, loopback, link-local (incl. cloud metadata 169.254.169.254), CGNAT, reserved.
const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
function isBlockedV4(ip) { return V4_BLOCKS.some(([b, n]) => inV4(ip, b, n)); }
function isBlockedV6(ip) {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return x === "::1" || x === "::" || x.startsWith("fe80") || x.startsWith("fc") ||
         x.startsWith("fd") || x.startsWith("::ffff:127.") || x.startsWith("::ffff:10.") ||
         x.startsWith("::ffff:169.254") || x.startsWith("::ffff:192.168") || x.startsWith("::ffff:172.");
}

// Resolve a bare host (or literal IP) and throw `errMsg` if any address is blocked.
async function assertHostResolvesPublic(host, errMsg) {
  const h = host.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(h) ? [{ address: h, family: net.isIP(h) }] : await lookup(h, { all: true });
  for (const { address, family } of addrs) {
    if (family === 4 && isBlockedV4(address)) throw new Error(errMsg);
    if (family === 6 && isBlockedV6(address)) throw new Error(errMsg);
  }
}

/** Throws if `raw` isn't a public http(s) URL. Returns the parsed URL on success. */
export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https URLs are allowed");
  await assertHostResolvesPublic(u.hostname, "URL resolves to a private/reserved address");
  return u;
}

/** Throws if `host` (a bare hostname or literal IP) resolves to a private/reserved address. */
export async function assertPublicHost(host) {
  if (!host || typeof host !== "string") throw new Error("Invalid host");
  await assertHostResolvesPublic(host, "Host resolves to a private/reserved address");
}

import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import { currentSyncCallDeadline } from "./deadline.js";
import { redactSensitiveText } from "./redact.js";

export interface JsonShape { kind: string; keys?: string[]; length?: number; items?: JsonShape[]; value?: string; }
export interface LocalServiceProbeResult {
  url: string;
  method: "GET" | "HEAD";
  status: number;
  statusText: string;
  elapsedMs: number;
  headers: { contentType?: string; contentLength?: number; location?: string };
  body?: { kind: "json" | "text" | "binary" | "empty"; preview?: string; bytesRead: number; truncated: boolean; jsonShape?: JsonShape };
  workspaceOwnership: "unknown";
  warnings: string[];
}

function loopback(address: string): boolean {
  if (net.isIPv4(address)) return address.startsWith("127.");
  if (net.isIPv6(address)) return address === "::1" || address.toLowerCase() === "0:0:0:0:0:0:0:1";
  return false;
}

interface AllowedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

async function assertAllowedUrl(raw: string): Promise<AllowedTarget> {
  if (raw.length > 2048) throw new Error("url is too long.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("url must be an absolute HTTP URL."); }
  if (url.protocol !== "http:") throw new Error("only http:// loopback URLs are allowed.");
  if (url.username || url.password) throw new Error("URL userinfo is not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || !["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("target host must be localhost, 127.0.0.1, or ::1.");
  if (!url.port) throw new Error("an explicit port from 1024 through 65535 is required.");
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("port must be from 1024 through 65535.");
  if (url.pathname.length + url.search.length > 1024) throw new Error("path and query are too long.");
  let address = host;
  let family: 4 | 6 = net.isIPv6(host) ? 6 : 4;
  if (host === "localhost") {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => !loopback(entry.address))) throw new Error("localhost did not resolve exclusively to loopback addresses.");
    const selected = addresses[0];
    address = selected.address;
    family = selected.family === 6 ? 6 : 4;
  }
  return { url, address, family };
}

function shape(value: unknown, depth = 0): JsonShape {
  if (depth >= 4) return { kind: "truncated" };
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) return { kind: "array", length: value.length, items: value.slice(0, 8).map((item) => shape(item, depth + 1)) };
  if (typeof value === "object") return { kind: "object", keys: Object.keys(value as Record<string, unknown>).slice(0, 64).map((key) => redactSensitiveText(key).slice(0, 120)) };
  if (typeof value === "string") return { kind: "string", value: redactSensitiveText(value).slice(0, 120) };
  return { kind: typeof value };
}

export async function probeLocalService(options: { url: string; method?: "GET" | "HEAD"; timeoutMs?: number; maxBodyBytes?: number }): Promise<LocalServiceProbeResult> {
  const target = await assertAllowedUrl(options.url);
  const url = target.url;
  const method = options.method ?? "GET";
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 3000, 10_000));
  const maxBodyBytes = Math.max(1000, Math.min(options.maxBodyBytes ?? 32_000, 256_000));
  const deadline = currentSyncCallDeadline();
  const remainingMs = deadline?.remainingMs() ?? Number.POSITIVE_INFINITY;
  if (remainingMs <= 0) throw new Error("local service probe exceeded the current synchronous call deadline.");
  const effectiveTimeoutMs = Math.max(1, Math.min(timeoutMs, Number.isFinite(remainingMs) ? Math.floor(remainingMs) : timeoutMs));
  const started = Date.now();
  const response = await new Promise<{ status: number; statusText: string; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean }>((resolve, reject) => {
    let settled = false;
    let totalTimer: NodeJS.Timeout | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (totalTimer) clearTimeout(totalTimer);
      callback();
    };
    const request = http.request({
      protocol: "http:",
      hostname: target.address,
      family: target.family,
      port: Number(url.port),
      path: `${url.pathname}${url.search}`,
      method,
      agent: false,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "CodexPro-local-service-probe/1",
        Host: url.host
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;
      res.on("data", (chunk: Buffer) => {
        if (method === "HEAD") return;
        const remaining = maxBodyBytes - bytes;
        if (remaining <= 0) { truncated = true; return; }
        const buffer = Buffer.from(chunk);
        if (buffer.byteLength > remaining) { chunks.push(buffer.subarray(0, remaining)); bytes += remaining; truncated = true; res.destroy(); return; }
        chunks.push(buffer); bytes += buffer.byteLength;
      });
       res.on("end", () => finish(() => resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? "", headers: res.headers, body: Buffer.concat(chunks), truncated })));
       res.on("close", () => { if (truncated || method === "GET") finish(() => resolve({ status: res.statusCode ?? 0, statusText: res.statusMessage ?? "", headers: res.headers, body: Buffer.concat(chunks), truncated })); });
     });
     request.setTimeout(effectiveTimeoutMs, () => { request.destroy(new Error("local service probe timed out")); });
     totalTimer = setTimeout(() => { request.destroy(new Error("local service probe exceeded its total deadline")); }, effectiveTimeoutMs);
     request.on("error", (error) => finish(() => reject(error)));
     request.end();
  });
  const contentType = typeof response.headers["content-type"] === "string" ? redactSensitiveText(response.headers["content-type"]).slice(0, 200) : undefined;
  const contentLength = typeof response.headers["content-length"] === "string" && /^\d+$/.test(response.headers["content-length"]) ? Number(response.headers["content-length"]) : undefined;
  const location = typeof response.headers.location === "string" ? redactSensitiveText(response.headers.location).slice(0, 1000) : undefined;
  const headers: LocalServiceProbeResult["headers"] = { ...(contentType ? { contentType } : {}), ...(contentLength !== undefined ? { contentLength } : {}), ...(location ? { location } : {}) };
  const warnings: string[] = ["Target service ownership is unknown; this probe does not associate the listener with a workspace process."];
  if (response.status >= 300 && response.status < 400) warnings.push("Redirect was reported but not followed.");
  const safeUrl = redactSensitiveText(url.toString()).slice(0, 2048);
  if (method === "HEAD" || !response.body.length) return { url: safeUrl, method, status: response.status, statusText: redactSensitiveText(response.statusText).slice(0, 160), elapsedMs: Date.now() - started, headers, body: { kind: "empty", bytesRead: response.body.length, truncated: false }, workspaceOwnership: "unknown", warnings };
  const textLike = !contentType || /(?:json|text|javascript|xml|html|svg|yaml)/i.test(contentType);
   if (!textLike) return { url: safeUrl, method, status: response.status, statusText: redactSensitiveText(response.statusText).slice(0, 160), elapsedMs: Date.now() - started, headers, body: { kind: "binary", bytesRead: response.body.length, truncated: response.truncated || (contentLength !== undefined && contentLength > response.body.length) }, workspaceOwnership: "unknown", warnings };
  const text = redactSensitiveText(response.body.toString("utf8")).slice(0, maxBodyBytes);
   const body: NonNullable<LocalServiceProbeResult["body"]> = { kind: "text", preview: text, bytesRead: response.body.length, truncated: response.truncated || (contentLength !== undefined ? contentLength > response.body.length : response.body.length >= maxBodyBytes) };
  if (/json/i.test(contentType ?? "")) {
    try { const parsed = JSON.parse(response.body.toString("utf8")); body.kind = "json"; body.jsonShape = shape(parsed); }
    catch { warnings.push("Response declared JSON but the bounded body was not valid JSON."); }
  }
  return { url: safeUrl, method, status: response.status, statusText: redactSensitiveText(response.statusText).slice(0, 160), elapsedMs: Date.now() - started, headers, body, workspaceOwnership: "unknown", warnings };
}

import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import { BrowserPairingStore } from "./browserAuth.js";

const CLIENT_ID = /^browser_[A-Za-z0-9-]{1,80}$/;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i;
const LOOPBACK_REMOTE = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export type BrowserBridgeEvent =
  | { type: "page_state"; clientId: string; authState: "signed_in" | "signed_out" | "unknown"; composerAvailable: boolean; streaming: boolean; blockingInteraction: boolean }
  | { type: "bind_requested"; clientId: string; taskId: string; revision: number }
  | { type: "dispatch_authorized"; clientId: string; taskId: string; revision: number };

export interface BrowserBridgeOptions {
  store: BrowserPairingStore;
  statusProvider: (clientId: string) => Promise<unknown>;
  onEvent?: (event: BrowserBridgeEvent) => Promise<void> | void;
}

function jsonError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function browserOrigin(req: Request): boolean {
  return typeof req.headers.origin === "string" && EXTENSION_ORIGIN.test(req.headers.origin);
}
function loopbackOnly(req: Request, res: Response, next: NextFunction): void {
  const host = req.get("host") ?? "";
  const remote = req.socket.remoteAddress ?? "";
  const forwarded = Object.keys(req.headers).some((key) => key === "forwarded" || key.startsWith("x-forwarded-"));
  if (!LOOPBACK_HOST.test(host) || !LOOPBACK_REMOTE.has(remote) || forwarded) {
    jsonError(res, 403, "loopback_required", "Browser continuation bridge is loopback-only."); return;
  }
  if (!browserOrigin(req)) { jsonError(res, 403, "origin_denied", "Browser continuation bridge requires the paired extension origin."); return; }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

const PairBody = z.object({
  profile_label: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  code: z.string().regex(/^[A-Z2-7]{8}$/),
  extension_version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/).optional()
}).strict();
const PageStateBody = z.object({
  auth_state: z.enum(["signed_in", "signed_out", "unknown"]),
  composer_available: z.boolean(), streaming: z.boolean(), blocking_interaction: z.boolean()
}).strict();
const TaskEventBody = z.object({
  task_id: z.string().regex(/^continuation_[A-Za-z0-9-]{1,80}$/),
  revision: z.number().int().min(1)
}).strict();
export function createBrowserBridgeApp(options: BrowserBridgeOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use("/continuation/v1", loopbackOnly);

  app.post("/continuation/v1/pair", async (req, res) => {
    const parsed = PairBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid pairing request."); return; }
    try {
      const result = await options.store.exchangePairing(parsed.data.profile_label, parsed.data.code, { extensionVersion: parsed.data.extension_version });
      res.json({ client_id: result.clientId, credential: result.credential, profile_label: result.profileLabel });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /expired|locked/i.test(message) ? 410 : 401;
      jsonError(res, status, message.split(":")[0] || "pairing_failed", message);
    }
  });

  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const id = String(req.headers["x-codexpro-browser-client"] ?? "");
    const credential = req.headers.authorization?.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1] ?? "";
    if (!CLIENT_ID.test(id) || !credential || !(await options.store.verifyCredential(id, credential))) {
      jsonError(res, 401, "browser_client_unauthorized", "Browser client credential is invalid or revoked."); return;
    }
    res.locals.browserClientId = id; next();
  };
  app.use("/continuation/v1/status", authenticate);
  app.use("/continuation/v1/page-state", authenticate);
  app.use("/continuation/v1/events", authenticate);
  app.use("/continuation/v1/client", authenticate);
  app.get("/continuation/v1/status", async (_req, res) => {
    const clientId = String(res.locals.browserClientId);
    res.json(await options.statusProvider(clientId));
  });
  app.post("/continuation/v1/page-state", async (req, res) => {
    const parsed = PageStateBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid page-state payload."); return; }
    await options.onEvent?.({ type: "page_state", clientId: String(res.locals.browserClientId), authState: parsed.data.auth_state, composerAvailable: parsed.data.composer_available, streaming: parsed.data.streaming, blockingInteraction: parsed.data.blocking_interaction });
    res.status(204).end();
  });
  app.post("/continuation/v1/events/bind", async (req, res) => {
    const parsed = TaskEventBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid bind event."); return; }
    await options.onEvent?.({ type: "bind_requested", clientId: String(res.locals.browserClientId), taskId: parsed.data.task_id, revision: parsed.data.revision });
    res.status(202).json({ accepted: true });
  });
  app.post("/continuation/v1/events/dispatch", async (req, res) => {
    const parsed = TaskEventBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid dispatch event."); return; }
    await options.onEvent?.({ type: "dispatch_authorized", clientId: String(res.locals.browserClientId), taskId: parsed.data.task_id, revision: parsed.data.revision });
    res.status(202).json({ accepted: true });
  });
  app.delete("/continuation/v1/client", async (_req, res) => {
    await options.store.revokeClient(String(res.locals.browserClientId));
    res.status(204).end();
  });
  return app;
}

export async function startBrowserContinuationBridge(options: BrowserBridgeOptions & { port?: number }): Promise<{ server: Server; port: number; url: string }> {
  const app = createBrowserBridgeApp(options);
  const server = app.listen(options.port ?? 0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve); server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") { await new Promise<void>((resolve) => server.close(() => resolve())); throw new Error("Browser continuation bridge did not bind a TCP port."); }
  return { server, port: address.port, url: `http://127.0.0.1:${address.port}` };
}

import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import { z } from "zod";
import { BrowserPairingStore } from "./browserAuth.js";

const CLIENT_ID = /^browser_[A-Za-z0-9-]{1,80}$/;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-p]{32})$/;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i;
const LOOPBACK_REMOTE = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export type BrowserBridgeEvent =
  | { type: "page_state"; clientId: string; authState: "signed_in" | "signed_out" | "authentication_required" | "ambiguous" | "unknown"; composerAvailable: boolean; streaming: boolean; platformState: "idle" | "busy" | "error" | "blocked" | "unknown"; blockingInteraction: boolean; recentUserInput: boolean; conversationBound: boolean; observationGenerationId: string; longObservationGap: boolean }
  | { type: "bind_requested"; clientId: string; taskId: string; revision: number }
  | { type: "dispatch_authorized"; clientId: string; taskId: string; revision: number };

export interface BrowserBridgeOptions {
  store: BrowserPairingStore;
  statusProvider: (clientId: string) => Promise<unknown>;
  onEvent?: (event: BrowserBridgeEvent) => Promise<void> | void;
  bindConversation?: (input: { clientId: string; taskId: string; revision: number; conversationFingerprint: string }) => Promise<unknown>;
  authorizeDispatch?: (input: { clientId: string; taskId: string; revision: number; conversationFingerprint: string }) => Promise<Record<string, unknown>>;
  completeDispatch?: (input: { clientId: string; taskId: string; revision: number; conversationFingerprint: string; authorizationToken: string }) => Promise<unknown>;
  releaseDispatch?: (input: { clientId: string; taskId: string; revision: number; authorizationToken: string }) => Promise<unknown>;
  manualInteraction?: (input: { clientId: string; taskId: string; revision: number; conversationFingerprint: string; reason: "manual_message" | "stop_generating" }) => Promise<unknown>;
}

function jsonError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}
const OPERATION_CODES = new Set([
  "stale_continuation_revision", "manual_turn_pending", "continuation_not_ready", "stale_continuation_nonce", "wrong_chat",
  "dispatch_authorization_missing", "dispatch_authorization_invalid", "dispatch_authorization_expired", "continuation_disabled"
]);
function operationError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const candidate = message.split(":", 1)[0] ?? "continuation_operation_failed";
  const code = OPERATION_CODES.has(candidate) ? candidate : "continuation_operation_failed";
  const status = code === "stale_continuation_revision" ? 409 : code === "wrong_chat" ? 409 : code.startsWith("dispatch_") || code === "manual_turn_pending" || code === "continuation_not_ready" || code === "stale_continuation_nonce" ? 409 : 400;
  jsonError(res, status, code, code);
}

function browserOriginId(req: Request): string | null {
  if (typeof req.headers.origin !== "string") return null;
  return req.headers.origin.match(EXTENSION_ORIGIN)?.[1] ?? null;
}
function loopbackOnly(req: Request, res: Response, next: NextFunction): void {
  const host = req.get("host") ?? "";
  const remote = req.socket.remoteAddress ?? "";
  const forwarded = Object.keys(req.headers).some((key) => key === "forwarded" || key.startsWith("x-forwarded-"));
  if (!LOOPBACK_HOST.test(host) || !LOOPBACK_REMOTE.has(remote) || forwarded) {
    jsonError(res, 403, "loopback_required", "Browser continuation bridge is loopback-only."); return;
  }
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
  auth_state: z.enum(["signed_in", "signed_out", "authentication_required", "ambiguous", "unknown"]),
  composer_available: z.boolean(), streaming: z.boolean(),
  platform_state: z.enum(["idle", "busy", "error", "blocked", "unknown"]),
  blocking_interaction: z.boolean(), recent_user_input: z.boolean(), conversation_bound: z.boolean(),
  observation_generation_id: z.string().regex(/^[A-Za-z0-9._:-]{1,160}$/),
  long_observation_gap: z.boolean().optional()
}).strict();
const TaskEventBody = z.object({
  task_id: z.string().regex(/^continuation_[A-Za-z0-9-]{1,80}$/),
  revision: z.number().int().min(1)
}).strict();
const FingerprintBody = TaskEventBody.extend({ conversation_fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const SafePageBody = z.object({ auth_state: z.literal("signed_in"), composer_ready: z.literal(true), streaming: z.literal(false), platform_state: z.literal("idle"), blocking_interaction: z.literal(false), recent_user_input: z.literal(false) }).strict();
const AuthorizeBody = FingerprintBody.extend({ page_state: SafePageBody }).strict();
const CompleteBody = FingerprintBody.extend({ authorization_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const ReleaseBody = TaskEventBody.extend({ authorization_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const ManualBody = FingerprintBody.extend({ reason: z.enum(["manual_message", "stop_generating"]) }).strict();
export function createBrowserBridgeApp(options: BrowserBridgeOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb", strict: true }));
  app.use("/continuation/v1", loopbackOnly);

  app.post("/continuation/v1/pair", async (req, res) => {
    const extensionId = browserOriginId(req);
    if (!extensionId) { jsonError(res, 403, "origin_denied", "Browser continuation pairing requires a Chrome extension origin."); return; }
    const parsed = PairBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid pairing request."); return; }
    try {
      const result = await options.store.exchangePairing(parsed.data.profile_label, parsed.data.code, { extensionVersion: parsed.data.extension_version, extensionId });
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
    const rawOrigin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const originId = browserOriginId(req);
    if (rawOrigin && !originId) { jsonError(res, 403, "origin_denied", "Browser continuation bridge rejects non-extension browser origins."); return; }
    if (!CLIENT_ID.test(id) || !credential || !(await options.store.verifyCredential(id, credential, originId ?? undefined))) {
      jsonError(res, 401, "browser_client_unauthorized", "Browser client credential is invalid or revoked."); return;
    }
    res.locals.browserClientId = id; next();
  };
  app.use("/continuation/v1/status", authenticate);
  app.use("/continuation/v1/page-state", authenticate);
  app.use("/continuation/v1/events", authenticate);
  app.use("/continuation/v1/dispatch", authenticate);
  app.use("/continuation/v1/client", authenticate);
  app.get("/continuation/v1/status", async (_req, res) => {
    const clientId = String(res.locals.browserClientId);
    res.json(await options.statusProvider(clientId));
  });
  app.post("/continuation/v1/page-state", async (req, res) => {
    const parsed = PageStateBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid page-state payload."); return; }
    await options.onEvent?.({
      type: "page_state", clientId: String(res.locals.browserClientId), authState: parsed.data.auth_state,
      composerAvailable: parsed.data.composer_available, streaming: parsed.data.streaming, platformState: parsed.data.platform_state,
      blockingInteraction: parsed.data.blocking_interaction, recentUserInput: parsed.data.recent_user_input,
      conversationBound: parsed.data.conversation_bound, observationGenerationId: parsed.data.observation_generation_id,
      longObservationGap: Boolean(parsed.data.long_observation_gap)
    });
    res.status(204).end();
  });
  app.post("/continuation/v1/events/bind", async (req, res) => {
    const parsed = options.bindConversation ? FingerprintBody.safeParse(req.body) : TaskEventBody.safeParse(req.body);
    if (!parsed.success) { jsonError(res, 400, "invalid_request", "Invalid bind event."); return; }
    const data = parsed.data as { task_id: string; revision: number; conversation_fingerprint?: string };
    if (options.bindConversation) {
      try {
        const result = await options.bindConversation({ clientId: String(res.locals.browserClientId), taskId: data.task_id, revision: data.revision, conversationFingerprint: data.conversation_fingerprint! });
        res.status(200).json(result);
      } catch (error) { operationError(res, error); }
      return;
    }
    await options.onEvent?.({ type: "bind_requested", clientId: String(res.locals.browserClientId), taskId: data.task_id, revision: data.revision });
    res.status(202).json({ accepted: true });
  });
  app.post("/continuation/v1/dispatch/authorize", async (req, res) => {
    const parsed = AuthorizeBody.safeParse(req.body);
    if (!parsed.success || !options.authorizeDispatch) { jsonError(res, 409, "dispatch_precondition_failed", "Dispatch page state is not safely idle or authorization is unavailable."); return; }
    const d = parsed.data;
    try { res.status(200).json(await options.authorizeDispatch({ clientId: String(res.locals.browserClientId), taskId: d.task_id, revision: d.revision, conversationFingerprint: d.conversation_fingerprint })); }
    catch (error) { operationError(res, error); }
  });
  app.post("/continuation/v1/dispatch/complete", async (req, res) => {
    const parsed = CompleteBody.safeParse(req.body); if (!parsed.success || !options.completeDispatch) { jsonError(res, 400, "invalid_request", "Invalid dispatch completion."); return; }
    const d = parsed.data;
    try { res.status(200).json(await options.completeDispatch({ clientId: String(res.locals.browserClientId), taskId: d.task_id, revision: d.revision, conversationFingerprint: d.conversation_fingerprint, authorizationToken: d.authorization_token })); }
    catch (error) { operationError(res, error); }
  });
  app.post("/continuation/v1/dispatch/release", async (req, res) => {
    const parsed = ReleaseBody.safeParse(req.body); if (!parsed.success || !options.releaseDispatch) { jsonError(res, 400, "invalid_request", "Invalid dispatch release."); return; }
    const d = parsed.data;
    try { res.status(200).json(await options.releaseDispatch({ clientId: String(res.locals.browserClientId), taskId: d.task_id, revision: d.revision, authorizationToken: d.authorization_token })); }
    catch (error) { operationError(res, error); }
  });
  app.post("/continuation/v1/events/manual", async (req, res) => {
    const parsed = ManualBody.safeParse(req.body); if (!parsed.success || !options.manualInteraction) { jsonError(res, 400, "invalid_request", "Invalid manual interaction event."); return; }
    const d = parsed.data;
    try { res.status(200).json(await options.manualInteraction({ clientId: String(res.locals.browserClientId), taskId: d.task_id, revision: d.revision, conversationFingerprint: d.conversation_fingerprint, reason: d.reason })); }
    catch (error) { operationError(res, error); }
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

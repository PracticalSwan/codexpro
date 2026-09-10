import { containsPrivateMetadataText } from "../redact.js";

export interface TelegramClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export class TelegramBotApiError extends Error {
  readonly retryAfter?: number;
  readonly status?: number;
  constructor(message: string, options: { retryAfter?: number; status?: number } = {}) {
    super(message);
    this.name = "TelegramBotApiError";
    this.retryAfter = options.retryAfter;
    this.status = options.status;
  }
}

function sanitizedErrorText(value: unknown, token: string): string {
  let text = value instanceof Error ? value.message : String(value ?? "Telegram Bot API error");
  text = text.replaceAll(token, "[redacted]");
  text = text.replace(/https?:\/\/[^\s"']+\/bot[^\s"']+/gi, "[Telegram Bot API URL]");
  text = text.replace(/\/bot\d{6,20}:[A-Za-z0-9_-]+/g, "[Telegram Bot API URL]");
  if (containsPrivateMetadataText(text)) return "[redacted Telegram error]";
  return text.replace(/[\r\n\0]+/g, " ").slice(0, 500);
}
interface TelegramEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
}

export class TelegramBotApiClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(token: string, options: TelegramClientOptions = {}) {
    const value = String(token ?? "").trim();
    if (!/^\d{6,20}:[A-Za-z0-9_-]{20,}$/.test(value)) throw new Error("Invalid Telegram bot token format.");
    this.token = value;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = String(options.baseUrl ?? "https://api.telegram.org").replace(/\/+$/, "");
    this.timeoutMs = Math.max(250, Math.min(120_000, Math.floor(options.timeoutMs ?? 15_000)));
  }

  private async call<T>(method: string, body?: Record<string, unknown>, requestTimeoutMs = this.timeoutMs): Promise<T> {
    const url = `${this.baseUrl}/bot${this.token}/${method}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      let envelope: TelegramEnvelope<T> = {};
      try { envelope = await response.json() as TelegramEnvelope<T>; }
      catch { throw new TelegramBotApiError(`Telegram Bot API ${method} returned invalid JSON.`, { status: response.status }); }
      if (!response.ok || envelope.ok !== true || envelope.result === undefined) {
        const retryAfter = Number.isFinite(envelope.parameters?.retry_after) ? Math.max(0, Math.floor(envelope.parameters!.retry_after!)) : undefined;
        const detail = sanitizedErrorText(envelope.description ?? `HTTP ${response.status}`, this.token);
        throw new TelegramBotApiError(`Telegram Bot API ${method} failed: ${detail}`, { status: response.status, ...(retryAfter !== undefined ? { retryAfter } : {}) });
      }
      return envelope.result;
    } catch (error) {
      if (error instanceof TelegramBotApiError) throw error;
      throw new TelegramBotApiError(`Telegram Bot API ${method} request failed: ${sanitizedErrorText(error, this.token)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  getMe(): Promise<any> { return this.call("getMe"); }
  getWebhookInfo(): Promise<any> { return this.call("getWebhookInfo"); }
  getUpdates(input: Record<string, unknown> = {}): Promise<any[]> { const longPollSeconds = Number(input.timeout ?? 0); const requestTimeoutMs = Math.max(this.timeoutMs, Number.isFinite(longPollSeconds) ? Math.max(0, longPollSeconds) * 1000 + 5_000 : this.timeoutMs); return this.call("getUpdates", input, requestTimeoutMs); }
  sendMessage(input: Record<string, unknown>): Promise<any> { return this.call("sendMessage", input); }
  editMessageText(input: Record<string, unknown>): Promise<any> { return this.call("editMessageText", input); }
  editMessageReplyMarkup(input: Record<string, unknown>): Promise<any> { return this.call("editMessageReplyMarkup", input); }
  answerCallbackQuery(input: Record<string, unknown>): Promise<any> { return this.call("answerCallbackQuery", input); }
}

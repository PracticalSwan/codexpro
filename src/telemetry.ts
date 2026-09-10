import { containsPrivateMetadataText, redactSensitiveText } from "./redact.js";

export type TelemetryStage = "request_arrival" | "dispatch" | "completion" | "response" | "backend" | "resilience";
export type TelemetryStatus = "ok" | "error" | "timeout" | "degraded";

export interface TelemetryEvent {
  stage: TelemetryStage;
  status: TelemetryStatus;
  tool?: string;
  durationMs?: number;
  resultBytes?: number;
  backend?: string;
  errorBoundary?: string;
  sessionState?: string;
  event?: string;
  reason?: string;
  entityId?: string;
}

export interface TelemetryRecord extends TelemetryEvent {
  sequence: number;
  timestamp: string;
}

export interface TelemetrySnapshot {
  counters: Record<string, number>;
  events: TelemetryRecord[];
  totalEvents: number;
}

function cleanName(value: unknown, max = 80): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/[\r\n\0]+/g, " ").trim();
  if (!text) return undefined;
  if (containsPrivateMetadataText(text)) return "redacted";
  return text.replace(/[^A-Za-z0-9._:/ -]+/g, "_").slice(0, max);
}

function cleanBoundary(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/[\r\n\0]+/g, " ").trim();
  if (!text) return undefined;
  if (containsPrivateMetadataText(text) || /(?:authorization|api[_-]?key|token|secret|password)\s*[:=]/i.test(text)) return "[redacted failure boundary]";
  const withoutPaths = text
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, "[path omitted]")
    .replace(/(^|\s)\/(?:[^\s"']+\/)*[^\s"']+/g, "$1[path omitted]");
  return redactSensitiveText(withoutPaths).slice(0, 240);
}
export class TelemetryRegistry {
  private readonly counters = new Map<string, number>();
  private readonly events: TelemetryRecord[] = [];
  private sequence = 0;
  readonly maxEvents: number;
  readonly maxCounters: number;

  constructor(options: { maxEvents?: number; maxCounters?: number } = {}) {
    this.maxEvents = Math.max(1, Math.min(1024, Math.floor(options.maxEvents ?? 128)));
    this.maxCounters = Math.max(16, Math.min(4096, Math.floor(options.maxCounters ?? 512)));
  }

  record(event: TelemetryEvent): void {
    const stage = event.stage;
    const status = event.status;
    const tool = cleanName(event.tool);
    const backend = cleanName(event.backend);
    const sessionState = cleanName(event.sessionState);
    const resilienceEvent = cleanName(event.event);
    const reason = cleanBoundary(event.reason);
    const entityId = cleanName(event.entityId, 120);
    const record: TelemetryRecord = {
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      stage,
      status,
      ...(tool ? { tool } : {}),
      ...(Number.isFinite(event.durationMs) ? { durationMs: Math.max(0, Math.floor(event.durationMs!)) } : {}),
      ...(Number.isFinite(event.resultBytes) ? { resultBytes: Math.max(0, Math.floor(event.resultBytes!)) } : {}),
      ...(backend ? { backend } : {}),
      ...(cleanBoundary(event.errorBoundary) ? { errorBoundary: cleanBoundary(event.errorBoundary) } : {}),
      ...(sessionState ? { sessionState } : {}),
      ...(resilienceEvent ? { event: resilienceEvent } : {}),
      ...(reason ? { reason } : {}),
      ...(entityId ? { entityId } : {})
    };
    this.events.push(record);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    this.bump(`stage:${stage}`);
    this.bump(`status:${status}`);
    this.bump(`stage:${stage}:${status}`);
    if (tool) this.bump(`tool:${tool}`);
    if (tool) this.bump(`tool:${tool}:${status}`);
    if (backend) this.bump(`backend:${backend}:${status}`);
    if (resilienceEvent) this.bump(`event:${resilienceEvent}`);
  }

  snapshot(): TelemetrySnapshot {
    return {
      counters: Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      events: this.events.map((event) => ({ ...event })),
      totalEvents: this.sequence
    };
  }

  private bump(key: string): void {
    if (!this.counters.has(key) && this.counters.size >= this.maxCounters) return;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }
}

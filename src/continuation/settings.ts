export type ContinuationBrowser = "chrome" | "edge";

export interface ContinuationSettings {
  continuationEnabled: boolean;
  continuationBrowser: ContinuationBrowser;
  continuationProfile: string;
  continuationCooldownMs: number;
  continuationMaxDispatches: number;
  continuationUnexpectedGraceMs: number;
  continuationNotificationsEnabled: boolean;
  continuationTelegramEnabled: boolean;
}

export const DEFAULT_CONTINUATION_SETTINGS: Readonly<ContinuationSettings> = Object.freeze({
  continuationEnabled: false,
  continuationBrowser: "chrome",
  continuationProfile: "default",
  continuationCooldownMs: 60_000,
  continuationMaxDispatches: 20,
  continuationUnexpectedGraceMs: 120_000,
  continuationNotificationsEnabled: true,
  continuationTelegramEnabled: false
});

function boolValue(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(text)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(text)) return false;
  throw new Error(`${label} must be enabled or disabled.`);
}
function boundedInteger(value: unknown, label: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

export function normalizeContinuationProfileLabel(value: unknown): string {
  const text = value === undefined || value === null || value === "" ? DEFAULT_CONTINUATION_SETTINGS.continuationProfile : String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(text)) {
    throw new Error("continuation profile must be 1-64 characters using letters, numbers, dot, underscore, or dash, and must not be a path.");
  }
  return text;
}

export function normalizeContinuationSettings(input: Partial<Record<keyof ContinuationSettings, unknown>> = {}): ContinuationSettings {
  const browser = String(input.continuationBrowser ?? DEFAULT_CONTINUATION_SETTINGS.continuationBrowser).trim().toLowerCase();
  if (browser !== "chrome" && browser !== "edge") throw new Error("continuation browser must be chrome or edge.");
  return {
    continuationEnabled: boolValue(input.continuationEnabled, "continuation", DEFAULT_CONTINUATION_SETTINGS.continuationEnabled),
    continuationBrowser: browser,
    continuationProfile: normalizeContinuationProfileLabel(input.continuationProfile),
    continuationCooldownMs: boundedInteger(input.continuationCooldownMs, "continuation cooldown", DEFAULT_CONTINUATION_SETTINGS.continuationCooldownMs, 10_000, 600_000),
    continuationMaxDispatches: boundedInteger(input.continuationMaxDispatches, "continuation max dispatches", DEFAULT_CONTINUATION_SETTINGS.continuationMaxDispatches, 1, 100),
    continuationUnexpectedGraceMs: boundedInteger(input.continuationUnexpectedGraceMs, "unexpected interruption grace", DEFAULT_CONTINUATION_SETTINGS.continuationUnexpectedGraceMs, 30_000, 600_000),
    continuationNotificationsEnabled: boolValue(input.continuationNotificationsEnabled, "continuation notifications", DEFAULT_CONTINUATION_SETTINGS.continuationNotificationsEnabled),
    continuationTelegramEnabled: boolValue(input.continuationTelegramEnabled, "Telegram continuation", DEFAULT_CONTINUATION_SETTINGS.continuationTelegramEnabled)
  };
}

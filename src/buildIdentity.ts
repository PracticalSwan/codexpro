import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEXPRO_PACKAGE_NAME, CODEXPRO_VERSION } from "./packageIdentity.js";

export type BuildChannel = "release" | "main" | "source" | "unknown";

export interface BuildIdentity {
  packageName: string;
  version: string;
  revision: string | null;
  channel: BuildChannel;
}

interface BuildMetadata {
  revision?: unknown;
  channel?: unknown;
}

const metadataCandidates = [
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "build-metadata.json"),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "build-metadata.json")
];

function validRevision(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{7,64}$/i.test(text) ? text : null;
}

function validChannel(value: unknown): BuildChannel {
  const text = String(value ?? "").trim();
  return text === "release" || text === "main" || text === "source" ? text : "unknown";
}

function readMetadata(): BuildMetadata | null {
  for (const candidate of metadataCandidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as BuildMetadata;
    } catch {
      // Missing or malformed build metadata is deliberately a soft failure.
    }
  }
  return null;
}

export function buildIdentity(): BuildIdentity {
  const metadata = readMetadata();
  const revision = validRevision(metadata?.revision);
  const channel = revision ? validChannel(metadata?.channel) : "unknown";
  return {
    packageName: CODEXPRO_PACKAGE_NAME,
    version: CODEXPRO_VERSION,
    revision,
    channel
  };
}

export function displayVersion(identity: BuildIdentity = buildIdentity()): string {
  if (identity.revision && (identity.channel === "main" || identity.channel === "source")) {
    return `${identity.version}+${identity.channel}.${identity.revision.slice(0, 12)}`;
  }
  return identity.version;
}

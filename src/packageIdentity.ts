import fs from "node:fs";

interface PackageIdentity {
  name?: unknown;
  version?: unknown;
}

const packagePath = new URL("../package.json", import.meta.url);
const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageIdentity;

export const CODEXPRO_PACKAGE_NAME = typeof parsed.name === "string" ? parsed.name : "codexpro-full";
export const CODEXPRO_VERSION = typeof parsed.version === "string" ? parsed.version : "unknown";

import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CODEXPRO_PACKAGE = "codexpro-full";
export const CODEXPRO_REPOSITORY = "git+https://github.com/PracticalSwan/codexpro.git";
export const CODEXPRO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));


const BROWSER_EXTENSION_PERMISSIONS = new Set(["storage", "tabs", "notifications"]);
const BROWSER_EXTENSION_HOSTS = new Set(["https://chatgpt.com/*", "http://127.0.0.1/*"]);

export function assertBrowserExtensionManifestSafe(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Browser extension manifest is invalid.");
  if (manifest.manifest_version !== 3) throw new Error("Browser extension must use Manifest V3.");
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions.map(String) : [];
  const hosts = Array.isArray(manifest.host_permissions) ? manifest.host_permissions.map(String) : [];
  const extraPermissions = permissions.filter((value) => !BROWSER_EXTENSION_PERMISSIONS.has(value));
  const missingPermissions = [...BROWSER_EXTENSION_PERMISSIONS].filter((value) => !permissions.includes(value));
  if (extraPermissions.length || missingPermissions.length) throw new Error("Browser extension permission set exceeds or misses the continuation allowlist.");
  if (hosts.length !== BROWSER_EXTENSION_HOSTS.size || hosts.some((value) => !BROWSER_EXTENSION_HOSTS.has(value))) throw new Error("Browser extension host permissions exceed the continuation allowlist.");
  if (manifest.externally_connectable) throw new Error("Browser extension externally_connectable is forbidden for continuation.");
  if (Array.isArray(manifest.web_accessible_resources) && manifest.web_accessible_resources.length) throw new Error("Browser extension web-accessible resources are forbidden for continuation.");
}

export function assertContinuationPackageFilesSafe(files) {
  const values = Array.isArray(files) ? files.map((value) => String(value).replaceAll("\\", "/")) : [];
  const forbidden = values.filter((value) => {
    const lower = value.toLowerCase();
    return /(^|\/)(?:user-data|browser-profile|profiles?|cookies?|local storage|session storage|indexeddb)(?:\/|$)/.test(lower) ||
      /(^|\/)(?:pairing|browser-clients?|browser-state|telegram-state)(?:\.[^/]*)?$/.test(lower) ||
      /(?:^|\/)[^/]*(?:screenshot|cdp[-_.]?trace)[^/]*$/.test(lower) || lower.endsWith(".har");
  });
  if (forbidden.length) throw new Error(`Private browser/continuation package artifacts are forbidden: ${forbidden.join(", ")}`);
}

export function assertContinuationPackagedTextSafe(text, source = "package text") {
  const value = String(text ?? "");
  const checks = [
    /https:\/\/chatgpt\.com\/c\/[A-Za-z0-9-]{20,}/i,
    /https?:\/\/api\.telegram\.org\/bot\d{6,20}:[A-Za-z0-9_-]{20,}/i,
    /\b\d{6,20}:[A-Za-z0-9_-]{20,}\b/,
    /\bcallback_[A-Za-z0-9_-]{20,}\b/,
    /\b(?:cookie|set-cookie)\s*[:=]\s*[A-Za-z0-9._~+/%=-]{16,}/i,
    /\bsession=[A-Za-z0-9._~+/%=-]{16,}/i,
    /\b(?:telegramUserId|privateChatId)\s*[:=]\s*["']?\d{8,20}/i
  ];
  if (checks.some((pattern) => pattern.test(value))) throw new Error(`Private continuation/package text is forbidden in ${source}.`);
}

function canonicalPath(value) {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
}

function releaseRootError(actualPath) {
  return new Error(
    `Release commands must run from the CodexPro root (${CODEXPRO_ROOT}). ` +
    `Current directory is ${actualPath}. Change directory first; do not use npm --prefix for npm pack or npm publish.`
  );
}

export function assertCodexProReleaseEnvironment({ cwd = process.cwd(), env = process.env } = {}) {
  const actualCwd = canonicalPath(cwd);
  if (actualCwd !== CODEXPRO_ROOT) throw releaseRootError(actualCwd);

  if (env.INIT_CWD && canonicalPath(env.INIT_CWD) !== CODEXPRO_ROOT) {
    throw releaseRootError(canonicalPath(env.INIT_CWD));
  }

  const expectedPackageJson = resolve(CODEXPRO_ROOT, "package.json");
  if (env.npm_package_json && canonicalPath(env.npm_package_json) !== canonicalPath(expectedPackageJson)) {
    throw new Error("npm is bound to a different package.json; stop before packing or publishing.");
  }

  const packageJson = JSON.parse(readFileSync(expectedPackageJson, "utf8"));
  const extensionManifest = JSON.parse(readFileSync(resolve(CODEXPRO_ROOT, "browser-extension", "manifest.json"), "utf8"));
  assertBrowserExtensionManifestSafe(extensionManifest);
  if (packageJson.name !== CODEXPRO_PACKAGE) {
    throw new Error(`Expected package name ${CODEXPRO_PACKAGE}; found ${packageJson.name ?? "(missing)"}.`);
  }
  if (packageJson.repository?.url !== CODEXPRO_REPOSITORY) {
    throw new Error("CodexPro repository metadata does not match the canonical release repository.");
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version ?? "")) {
    throw new Error("CodexPro package.json has an invalid release version.");
  }

  return {
    root: CODEXPRO_ROOT,
    name: packageJson.name,
    version: packageJson.version
  };
}

function isDirectInvocation() {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectInvocation()) {
  try {
    const release = assertCodexProReleaseEnvironment();
    console.log(`CodexPro release guard: ${release.name}@${release.version}`);
  } catch (error) {
    console.error(`[release guard] ${error.message}`);
    process.exitCode = 1;
  }
}

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { CODEXPRO_PACKAGE, assertCodexProReleaseEnvironment, assertContinuationPackageFilesSafe, assertContinuationPackagedTextSafe } from "./release-guard.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCliCandidate = process.env.npm_execpath ||
  (process.platform === "win32" ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js") : undefined);
const npmCli = npmCliCandidate && existsSync(npmCliCandidate) ? npmCliCandidate : undefined;

function fail(message) {
  throw new Error(message);
}

try {
  const release = assertCodexProReleaseEnvironment();
  const packArgs = ["pack", "--dry-run", "--ignore-scripts", "--json"];
  const packed = spawnSync(npmCli ? process.execPath : npm, npmCli ? [npmCli, ...packArgs] : packArgs, {
    cwd: release.root,
    encoding: "utf8",
    env: { ...process.env, INIT_CWD: release.root }
  });

  if (packed.error) fail(`npm pack could not start: ${packed.error.message}`);
  if (packed.status !== 0) fail(`npm pack failed: ${(packed.stderr || packed.stdout).trim()}`);

  let packages;
  try {
    packages = JSON.parse(packed.stdout);
  } catch {
    fail("npm pack did not return a JSON package manifest.");
  }
  const tarball = Array.isArray(packages) ? packages[0] : null;
  if (!tarball || tarball.name !== CODEXPRO_PACKAGE || tarball.version !== release.version) {
    fail(`Expected ${CODEXPRO_PACKAGE}@${release.version}; npm pack selected ${tarball?.name ?? "(missing)"}@${tarball?.version ?? "(missing)"}.`);
  }
  if (tarball.filename !== `${CODEXPRO_PACKAGE}-${release.version}.tgz`) {
    fail(`Unexpected tarball filename: ${tarball.filename ?? "(missing)"}.`);
  }
  const packedFiles = (tarball.files ?? []).map((entry) => String(entry.path ?? "").replaceAll("\\", "/"));
  assertContinuationPackageFilesSafe(packedFiles);
  const textExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".json", ".md", ".html", ".css", ".svg", ".txt", ".env"]);
  for (const file of packedFiles) {
    if (!textExtensions.has(extname(file).toLowerCase()) && !["LICENSE"].includes(file)) continue;
    const fullPath = resolve(release.root, file);
    if (fullPath !== release.root && !fullPath.startsWith(`${release.root}${sep}`)) fail(`Package path escaped release root: ${file}`);
    if (!existsSync(fullPath)) continue;
    assertContinuationPackagedTextSafe(readFileSync(fullPath, "utf8"), file);
  }
  const requiredRuntimeFiles = ["dist/stdio.js", "dist/http.js", "scripts/codexpro.mjs", "README.md", "LICENSE"];
  const missingRuntimeFiles = requiredRuntimeFiles.filter((file) => !packedFiles.includes(file));
  if (missingRuntimeFiles.length) {
    fail(`Runtime files are missing from the tarball: ${missingRuntimeFiles.join(", ")}.`);
  }
  const forbiddenInternal = packedFiles.filter((file) => {
    const lower = file.toLowerCase();
    return (
      lower === "agents.md" ||
      lower.startsWith("docs/agentic/") ||
      lower.startsWith("docs/superpowers/") ||
      lower.startsWith(".ai-bridge/") ||
      lower === ".env" ||
      lower.startsWith(".env.") ||
      lower.includes("/.env") ||
      lower.startsWith("profiles/") ||
      lower.startsWith("runtime/")
    );
  });
  if (forbiddenInternal.length) {
    fail(`Private or planning files entered the public tarball: ${forbiddenInternal.join(", ")}.`);
  }

  console.log(JSON.stringify({
    name: tarball.name,
    version: tarball.version,
    filename: tarball.filename,
    size: tarball.size,
    unpackedSize: tarball.unpackedSize
  }, null, 2));
} catch (error) {
  console.error(`[release pack] ${error.message}`);
  process.exitCode = 1;
}

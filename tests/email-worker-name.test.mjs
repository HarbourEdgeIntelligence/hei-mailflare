import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-email-worker-name-"));
const previous = process.env.CF_EMAIL_WORKER_NAME;
after(() => {
	rmSync(outDir, { recursive: true, force: true });
	if (previous === undefined) delete process.env.CF_EMAIL_WORKER_NAME;
	else process.env.CF_EMAIL_WORKER_NAME = previous;
});
await build({
	stdin: { contents: "export { getEmailWorkerName } from './src/lib/cloudflare-api-utils';", resolveDir: root, loader: "ts" },
	outfile: join(outDir, "utils.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	packages: "external",
	alias: { "@": join(root, "src") },
	logLevel: "silent",
});
const { getEmailWorkerName } = await import(pathToFileURL(join(outDir, "utils.mjs")).href);

test("email routing targets the Worker named in CF_EMAIL_WORKER_NAME", () => {
	process.env.CF_EMAIL_WORKER_NAME = "hei-mailflare";
	assert.equal(getEmailWorkerName(), "hei-mailflare");
});

test("email routing falls back to mailflare", () => {
	delete process.env.CF_EMAIL_WORKER_NAME;
	assert.equal(getEmailWorkerName(), "mailflare");
	process.env.CF_EMAIL_WORKER_NAME = "  ";
	assert.equal(getEmailWorkerName(), "mailflare");
});

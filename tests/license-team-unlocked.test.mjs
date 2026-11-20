import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// This fork unlocks the Team plan without a Paymug key.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-license-team-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
await build({
	stdin: { contents: "export { toLicenseStatus } from './src/lib/licenses/utils';", resolveDir: root, loader: "ts" },
	outfile: join(outDir, "utils.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	packages: "external",
	alias: { "@": join(root, "src") },
	logLevel: "silent",
});
const { toLicenseStatus } = await import(pathToFileURL(join(outDir, "utils.mjs")).href);

const unactivated = {
	plan: "community",
	state: "inactive",
	features: "[]",
	seatLimit: 1,
	instanceId: null,
	instanceUrl: null,
	activatedAt: null,
	validatedAt: null,
};

test("an installation without a license key gets the unlimited Team plan", () => {
	const status = toLicenseStatus(unactivated);
	assert.equal(status.active, true);
	assert.equal(status.plan, "team");
	assert.equal(status.seatLimit, null);
});

test("an expired Pro key still gets the unlimited Team plan", () => {
	const status = toLicenseStatus({ ...unactivated, plan: "pro", state: "expired", seatLimit: 3 });
	assert.equal(status.active, true);
	assert.equal(status.plan, "team");
	assert.equal(status.seatLimit, null);
});

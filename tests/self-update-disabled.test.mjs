import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// HEI fork: upstream is merged by hand, because the update workflow would replace
// the fork's own changes. The admin update endpoints, the auto-update cron and the
// workflow it dispatches are all off.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const outDir = mkdtempSync(join(root, "tests", ".tmp-self-update-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const mocks = {
	"next/server": "export const NextResponse={json:(body,init)=>({body,status:init?.status??200})};",
	"./GET": "export async function GET(){return {status:200};}",
	"./POST": "export async function POST(){globalThis.__dispatched=true;return {status:200};}",
	"./PATCH": "export async function PATCH(){return {status:200};}",
};
await build({
	entryPoints: [join(root, "src/app/api/admin/update/route.ts")],
	outfile: join(outDir, "route.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	packages: "external",
	alias: { "@": join(root, "src") },
	plugins: [{
		name: "mock-update-deps",
		setup(builder) {
			const names = Object.keys(mocks).map((name) => name.replace(/[/.-]/g, "\\$&")).join("|");
			builder.onResolve({ filter: new RegExp(`^(${names})$`) }, (args) => ({ path: args.path, namespace: "mock" }));
			builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
		},
	}],
	logLevel: "silent",
});
const route = await import(pathToFileURL(join(outDir, "route.mjs")).href);

test("the admin update endpoints refuse every request", async () => {
	for (const method of ["GET", "POST", "PATCH"]) {
		const response = await route[method](new Request("https://mail.example.com/api/admin/update", { method }));
		assert.equal(response.status, 403, method);
	}
	assert.equal(globalThis.__dispatched, undefined);
});

test("the auto-update cron returns before reading settings", () => {
	assert.match(read("src/lib/update/auto-update.ts"), /export async function runAutoUpdate\(env: CloudflareEnv\) \{\n\tif \(!SELF_UPDATE_ENABLED\) return;/);
});

test("the admin card skips the update check and keeps the migration check", () => {
	const card = read("src/components/admin-update-card.tsx");
	assert.match(card, /useState\(SELF_UPDATE_ENABLED\)/);
	assert.match(card, /if \(SELF_UPDATE_ENABLED\) getApplicationUpdateStatus\(\)/);
	assert.match(card, /getMigrationStatus\(\)/);
});

test("the fork has no workflow that merges upstream", () => {
	assert.equal(existsSync(join(root, ".github/workflows/deploy-update.yml")), false);
});

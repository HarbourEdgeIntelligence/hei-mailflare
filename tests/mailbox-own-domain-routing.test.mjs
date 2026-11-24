import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// HEI fork: a new mailbox claims its address on its own domain only. Claiming the
// same local part on every other domain failed with Cloudflare's "Duplicated Zone
// rule" when that address already had a forward, and receiving setup re-created
// those extra routes even for mailboxes switched to their own domain.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const outDir = mkdtempSync(join(root, "tests", ".tmp-mailbox-own-domain-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const mocks = {
	"drizzle-orm": "export const eq=(c,v)=>({eq:[c,v]});export const and=(...a)=>({and:a});export const or=(...a)=>({or:a});export const ne=(c,v)=>({ne:[c,v]});",
	"@/db/schema": "export const domains={id:'domains.id',userId:'domains.userId',zoneId:'domains.zoneId'};export const mailboxes={id:'m.id',domainId:'m.domainId',localPart:'m.localPart',useAllDomains:'m.useAllDomains'};",
	"@/db": "const rows={from(){return rows;},innerJoin(){return rows;},where(){return Promise.resolve(globalThis.__mailboxes);}};export function getDb(){return {select(){return rows;},update(){return {set(){return {where(){}}}}}}}",
	"@/lib/cloudflare-api": "export async function disableEmailRouting(){}",
	"@/lib/cloudflare-dns": "export async function deleteDnsRecord(){}",
	"@/lib/domains/dns-setup": "export async function setupDomainDnsRecord(){}",
	"@/lib/domains/provision": "export const isManualZone=(z)=>z==='manual';",
	"@/lib/domains/cloudflare-cleanup": "export async function deleteEmailRoutingRulesForDomain(){}",
	"@/lib/domains/mx-records": "export async function removeMxRecords(){}export async function restoreMxRecordsAfterFailure(){}",
	"@/lib/domains/adopt-zone": "export async function adoptCloudflareZone(env,d){return d;}",
	"@/lib/domains/receiving-dns": "export async function listDomainMx(){return [];}export class MxConflictError extends Error{}",
	"@/lib/domains/resend-receiving": "export async function setupResendReceiving(){}export async function removeResendReceiving(){}export async function hasResendReceivingConfig(){return false;}",
	"@/lib/aws/ses-receiving": "export async function setupSesReceiving(){}export async function removeSesReceiving(){}export async function hasSesReceivingConfig(){return false;}",
	"@/lib/deliverability/mta-sts-guard": "export async function assertMxChangeAllowed(){}export async function republishMtaStsAfterMxChange(){}",
	"@/lib/mailboxes/domain-addresses": "export async function ensureMailboxDomainRouting(env,db,mailbox){globalThis.__routed.push(mailbox);}",
};

await build({
	stdin: { contents: "export { setupCloudflareReceiving } from './src/lib/domains/receiving';", resolveDir: root, loader: "ts" },
	outfile: join(outDir, "receiving.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	packages: "external",
	alias: { "@": join(root, "src") },
	plugins: [{
		name: "mock-receiving-deps",
		setup(builder) {
			const names = Object.keys(mocks).map((name) => name.replace(/[/.-]/g, "\\$&")).join("|");
			builder.onResolve({ filter: new RegExp(`^(${names})$`) }, (args) => ({ path: args.path, namespace: "mock" }));
			builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
		},
	}],
	logLevel: "silent",
});
const { setupCloudflareReceiving } = await import(pathToFileURL(join(outDir, "receiving.mjs")).href);

beforeEach(() => {
	globalThis.__routed = [];
});

test("receiving setup keeps each mailbox's own all-domains choice", async () => {
	globalThis.__mailboxes = [
		{ id: "own", domainId: "d1", localPart: "info", useAllDomains: false },
		{ id: "all", domainId: "d2", localPart: "team", useAllDomains: true },
	];
	await setupCloudflareReceiving({}, { id: "d1", userId: "u1", hostname: "example.com", zoneId: "zone-1" }, { replaceMx: false });
	assert.deepEqual(
		globalThis.__routed.map((mailbox) => [mailbox.id, mailbox.useAllDomains]),
		[["own", false], ["all", true]],
	);
});

const creationPaths = [
	"src/app/api/mailboxes/route.ts",
	"src/app/api/mailboxes/utils.ts",
	"src/app/api/v1/mailboxes/utils.ts",
	"src/app/api/auth/register/route.ts",
];

test("every mailbox creation path stores and routes its own domain only", () => {
	for (const path of creationPaths) {
		const source = read(path);
		assert.doesNotMatch(source, /useAllDomains: true/, path);
		assert.match(source, /db\.insert\(mailboxes\)\.values\(\{[^}]*useAllDomains: NEW_MAILBOX_USE_ALL_DOMAINS/s, path);
		assert.match(source, /ensureMailboxDomainRouting\([^)]*useAllDomains: NEW_MAILBOX_USE_ALL_DOMAINS/s, path);
	}
});

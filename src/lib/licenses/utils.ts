import type { licenseSettings } from "@/db/schema";
import type { LicensePlan, LicenseState, LicenseStatus, PaymugLicenseResponse } from "./types";
import { LICENSE_PRODUCT_IDS } from "./constants";

export async function hashLicenseKey(licenseKey: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(licenseKey));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function parseFeatures(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((feature): feature is string => typeof feature === "string") : [];
	} catch {
		return [];
	}
}

export function parsePaymugLicenseResponse(value: unknown): PaymugLicenseResponse {
	if (!value || typeof value !== "object") throw new Error("Paymug returned an invalid license response");
	const response = value as Record<string, unknown>;
	const states: LicenseState[] = ["active", "invalid", "expired", "deactivated"];

	if (typeof response.valid !== "boolean" || !states.includes(response.state as LicenseState)) {
		throw new Error("Paymug returned an invalid license response");
	}

	return {
		valid: response.valid,
		state: response.state as PaymugLicenseResponse["state"],
		instanceId: typeof response.instanceId === "string" ? response.instanceId : undefined,
		productId: typeof response.productId === "string" ? response.productId : undefined,
		plan: typeof response.plan === "string" ? response.plan : undefined,
		features: Array.isArray(response.features)
			? response.features.filter((feature): feature is string => typeof feature === "string")
			: undefined,
		seatLimit: response.seatLimit === null ? null : typeof response.seatLimit === "number" && Number.isInteger(response.seatLimit) && response.seatLimit >= 0 ? response.seatLimit : undefined,
	};
}

export function normalizeLicensePlan(productId: string | undefined, plan: string | undefined): LicensePlan | null {
	if (productId) {
		if (productId === LICENSE_PRODUCT_IDS.pro) return "pro";
		if (productId === LICENSE_PRODUCT_IDS.team) return "team";
		return null;
	}

	const normalized = plan?.trim().toLowerCase();
	return normalized === "pro" || normalized === "team" ? normalized : null;
}

/**
 * HEI fork: every installation runs as an active, unlimited Team license, so the
 * Pro and Team features work without a Paymug key. The stored key state is kept
 * for display only.
 */
export function toLicenseStatus(settings: typeof licenseSettings.$inferSelect): LicenseStatus {
	return {
		plan: "team",
		state: settings.state,
		features: parseFeatures(settings.features),
		seatLimit: null,
		instanceId: settings.instanceId,
		instanceUrl: settings.instanceUrl,
		active: true,
		activatedAt: settings.activatedAt,
		validatedAt: settings.validatedAt,
	};
}

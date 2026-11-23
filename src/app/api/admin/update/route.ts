import { NextResponse } from "next/server";
import { SELF_UPDATE_ENABLED } from "@/lib/update/flags";
import { GET as getUpdateStatus } from "./GET";
import { POST as startUpdate } from "./POST";
import { PATCH as saveUpdateSettings } from "./PATCH";

function selfUpdateDisabled() {
	return NextResponse.json({ error: "Self-update is disabled on this installation. Upstream changes are merged by hand." }, { status: 403 });
}

export const GET = SELF_UPDATE_ENABLED ? getUpdateStatus : selfUpdateDisabled;
export const POST = SELF_UPDATE_ENABLED ? startUpdate : selfUpdateDisabled;
export const PATCH = SELF_UPDATE_ENABLED ? saveUpdateSettings : selfUpdateDisabled;

import { organizationIdForUser } from "@crm/auth";
import { connection } from "next/server";
import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { getSession } from "@/lib/session";

const AGENT_FOLLOW_UPS_PATH = "/internal/crm/follow-ups";
const MAX_BODY_LENGTH = 30_000;

export async function POST(request: Request): Promise<Response> {
	await connection();

	if (!bridgeConfigured()) {
		return Response.json(
			{ error: "The research agent is not configured for this install." },
			{ status: 503 },
		);
	}

	const session = await getSession();
	if (!session) {
		return Response.json({ error: "Not signed in." }, { status: 401 });
	}

	const organizationId = await organizationIdForUser(session.user.id);
	if (!organizationId) {
		return Response.json(
			{ error: "No workspace is available for this account." },
			{ status: 503 },
		);
	}

	const body = await request.text();
	if (body.length > MAX_BODY_LENGTH) {
		return Response.json(
			{ error: "Follow-up context is too large." },
			{ status: 413 },
		);
	}

	let upstream: Response;
	try {
		upstream = await fetch(new URL(AGENT_FOLLOW_UPS_PATH, AGENT_URL), {
			method: "POST",
			headers: {
				authorization: `Bearer ${await mintBridgeToken(
					{
						id: session.user.id,
						email: session.user.email,
						name: session.user.name,
					},
					{},
					organizationId,
				)}`,
				"content-type": "application/json",
			},
			body,
			signal: request.signal,
		});
	} catch (error) {
		return Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: { "content-type": "application/json" },
	});
}

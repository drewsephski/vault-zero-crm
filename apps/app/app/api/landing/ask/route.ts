import { NextResponse } from "next/server";

const RESPONSES: Record<string, string> = {
	"Why does this fit our buy box?":
		"This target matches your buy box on industry, geography, owner involvement, and operating scale. The strongest fit is its recurring customer base; confirm normalized cash flow before advancing it.",
	"What important facts are missing?":
		"The main gaps are verified revenue, seller motivation, and customer concentration. Eve would prioritize financial statements and an owner conversation before treating this as qualified.",
	"What should we do next?":
		"Start with a lightweight owner outreach and request the last three years of financials. That should resolve the highest-value unknowns before you spend time on a deeper diligence pass.",
};

export async function POST(request: Request) {
	const body = await request.json().catch(() => null);
	const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

	if (!prompt || prompt.length > 500) {
		return NextResponse.json(
			{ error: "Prompt must be between 1 and 500 characters." },
			{ status: 400 },
		);
	}

	const response =
		RESPONSES[prompt] ??
		"For a question like this, Eve would compare the target against your buy box, surface the supporting evidence, and call out what still needs verification. In the full product, the answer is grounded in the target record and its sources.";

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			for (const word of response.split(" ")) {
				controller.enqueue(encoder.encode(`${word} `));
				await new Promise((resolve) => setTimeout(resolve, 28));
			}
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"cache-control": "no-store",
			"content-type": "text/plain; charset=utf-8",
		},
	});
}

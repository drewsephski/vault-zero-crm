import { defineDynamic, defineInstructions } from "eve/instructions";
import { focusOn } from "../lib/focus";
import { sessionPreamble } from "../lib/preamble";

export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			const attributes = ctx.session.auth.current?.attributes ?? {};
			const kind = asString(attributes.taskKind);

			const { markdown, focus } = await sessionPreamble(
				{
					contactId: asString(attributes.contactId),
					companyId: asString(attributes.companyId),
					dealId: asString(attributes.dealId),
				},
				{
					dispatched: Boolean(kind),
					kind,
					reason: asString(attributes.reason),
				},
			);

			focusOn({ ...focus, sessionId: ctx.session.id });

			return defineInstructions({ markdown });
		},
	},
});

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

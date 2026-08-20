import { defineDynamic, defineInstructions } from "eve/instructions";
import { runInOrganization } from "@crm/db/tenancy";
import { focusOn } from "../lib/focus";
import { sessionPreamble } from "../lib/preamble";
import { organizationIdFromAuth } from "../lib/tenant";

export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			const attributes = ctx.session.auth.current?.attributes ?? {};
			const kind = asString(attributes.taskKind);
			const organizationId = organizationIdFromAuth(ctx.session.auth);

			const preamble = organizationId
				? await runInOrganization(organizationId, () =>
						sessionPreamble(
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
						),
					)
				: {
						markdown: "",
						focus: {
							contactId: asString(attributes.contactId),
							companyId: asString(attributes.companyId),
						},
					};

			const { markdown, focus } = preamble;

			focusOn({ ...focus, sessionId: ctx.session.id });

			return defineInstructions({ markdown });
		},
	},
});

function asString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

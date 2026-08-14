import { describe, expect, it } from "bun:test";
import { WorkspaceMode } from "@crm/db/enums";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useHydratedValue } from "../lib/use-hydrated-value";
import { workspaceLabels } from "../lib/workspace-mode";

describe("workspace mode labels", () => {
	it("keeps sales terminology as the fallback", () => {
		expect(workspaceLabels(undefined)).toMatchObject({
			companies: "Companies",
			company: "Company",
			deals: "Deals",
			deal: "Deal",
		});
	});

	it("uses acquisition terminology without changing routes", () => {
		expect(workspaceLabels(WorkspaceMode.ACQUISITION)).toMatchObject({
			companies: "Targets",
			company: "Target",
			deals: "Opportunities",
			deal: "Opportunity",
		});
	});

	it("keeps hydrated workspace values stable during server rendering", () => {
		function Label() {
			return useHydratedValue("Targets", "Companies");
		}

		expect(renderToStaticMarkup(createElement(Label))).toBe("Companies");
	});
});

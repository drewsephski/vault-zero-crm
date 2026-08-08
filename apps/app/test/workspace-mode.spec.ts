import { describe, expect, it } from "bun:test";
import { WorkspaceMode } from "@crm/db/enums";
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
});

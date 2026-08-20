import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { AcquisitionEngagementStage, WorkspaceMode } from "@crm/db/enums";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AcquisitionEngagementStageIndicator,
	acquisitionEngagementStageLabel,
	showsAcquisitionEngagementStageMenu,
} from "../components/crm/acquisition-engagement-stage";
import { DEAL_STAGE_OPTIONS } from "../components/crm/deal-stage";
import { workspaceLabels } from "../lib/workspace-mode";

const root = new URL("..", import.meta.url).pathname;

function readSource(path: string) {
	return readFileSync(`${root}/${path}`, "utf8");
}

describe("acquisition opportunities mode boundary", () => {
	it("uses acquisition terminology in acquisition mode", () => {
		expect(workspaceLabels(WorkspaceMode.ACQUISITION)).toMatchObject({
			deals: "Opportunities",
			deal: "Opportunity",
		});
	});

	it("keeps sales deal terminology in sales mode", () => {
		expect(workspaceLabels(WorkspaceMode.SALES)).toMatchObject({
			deals: "Deals",
			deal: "Deal",
		});
	});

	it("maps acquisition engagement stages to human labels", () => {
		expect(
			acquisitionEngagementStageLabel(AcquisitionEngagementStage.OUTREACH),
		).toBe("Outreach");
		expect(
			acquisitionEngagementStageLabel(
				AcquisitionEngagementStage.MATERIALS_RECEIVED,
			),
		).toBe("Materials received");
		expect(
			acquisitionEngagementStageLabel(AcquisitionEngagementStage.PASSED),
		).toBe("Passed");
	});

	it("renders acquisition-native stage indicators", () => {
		const markup = renderToStaticMarkup(
			<AcquisitionEngagementStageIndicator
				stage={AcquisitionEngagementStage.UNDERWRITING}
			/>,
		);
		expect(markup).toContain("Underwriting");
	});

	it("allows stage menus only for active engagements", () => {
		expect(showsAcquisitionEngagementStageMenu("ACTIVE")).toBe(true);
		expect(showsAcquisitionEngagementStageMenu("TERMINAL")).toBe(false);
	});

	it("keeps sales deal stage labels intact", () => {
		expect(
			DEAL_STAGE_OPTIONS.some((option) => option.label === "Demo booked"),
		).toBe(true);
	});

	it("routes acquisition page actions through engagement components", () => {
		const pageContent = readSource(
			"app/(app)/[slug]/deals/deals-page-content.tsx",
		);
		expect(pageContent).toContain("CreateEngagementSheet");
		expect(pageContent).toContain("CreateDealSheet");
		expect(pageContent).toContain("OpportunitiesTable");
		expect(pageContent).toContain("DealsTable");
	});

	it("uses engagement-backed list and create flows in acquisition mode", () => {
		expect(
			readSource("app/(app)/[slug]/deals/opportunities-table.tsx"),
		).toContain("acquisition.listEngagements");
		const createSheet = readSource(
			"app/(app)/[slug]/deals/create-engagement-sheet.tsx",
		);
		expect(createSheet).toContain("acquisition.createEngagement");
		expect(createSheet).toContain("AcquisitionEngagementStage.OUTREACH");
		expect(createSheet).not.toContain("deals.create");
	});

	it("keeps sales deals table on generic deal APIs", () => {
		const dealsTable = readSource("app/(app)/[slug]/deals/deals-table.tsx");
		expect(dealsTable).toContain("deals.list");
		expect(dealsTable).toContain("DealStageMenu");
		expect(
			readSource("app/(app)/[slug]/deals/create-deal-sheet.tsx"),
		).toContain("deals.create");
	});

	it("opens company records from the opportunities table", () => {
		const opportunitiesTable = readSource(
			"app/(app)/[slug]/deals/opportunities-table.tsx",
		);
		expect(opportunitiesTable).toContain('kind: "company"');
		expect(opportunitiesTable).not.toContain('kind: "deal"');
	});
});

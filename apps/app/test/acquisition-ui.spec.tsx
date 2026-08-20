import { describe, expect, it } from "bun:test";
import { AcquisitionStage } from "@crm/db/enums";
import { TooltipProvider } from "@crm/ui/components/tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { AcquisitionTargetCell } from "../app/(app)/[slug]/companies/companies-table";
import { LifecycleControl } from "../components/crm/acquisition-dossier";
import { DetailSheetTabs } from "../components/detail-sheet";

describe("acquisition interface accessibility", () => {
	it("renders a keyboard-accessible target dossier action", () => {
		const markup = renderToStaticMarkup(
			<AcquisitionTargetCell
				target={{
					id: "company-1",
					name: "Atlas Services",
					iconUrl: null,
					iconDarkUrl: null,
					iconTone: null,
					logoUrl: null,
				}}
				onOpen={() => undefined}
			/>,
		);

		expect(markup).toContain("<button");
		expect(markup).toContain('type="button"');
		expect(markup).toContain(
			'aria-label="Open Atlas Services acquisition dossier"',
		);
		expect(markup).toContain("Atlas Services");
	});

	it("renders a named lifecycle control with pending feedback", () => {
		const markup = renderToStaticMarkup(
			<TooltipProvider>
				<LifecycleControl
					stage={AcquisitionStage.QUALIFIED}
					pending
					onStageChange={() => undefined}
				/>
			</TooltipProvider>,
		);
		const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
		const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];

		expect(labelledBy).toBeString();
		expect(describedBy).toBeString();
		expect(markup).toContain(`id="${labelledBy}"`);
		expect(markup).toContain(`id="${describedBy}"`);
		expect(markup).toContain('aria-busy="true"');
		expect(markup).toContain('role="status"');
		expect(markup).toContain("Saving lifecycle");
	});

	it("renders a named horizontally scrollable tab list", () => {
		const markup = renderToStaticMarkup(
			<DetailSheetTabs
				value="overview"
				onValueChange={() => undefined}
				tabs={[
					{ value: "overview", label: "Overview", content: "Overview" },
					{ value: "contacts", label: "Contacts", content: "Contacts" },
					{ value: "opportunities", label: "Opportunities", content: "Deals" },
					{ value: "timeline", label: "Timeline", content: "Timeline" },
					{ value: "acquisition", label: "Acquisition", content: "Target" },
					{ value: "eve", label: "Eve", content: "Eve" },
				]}
			/>,
		);
		const scrollerIndex = markup.indexOf('data-slot="tabs-list-scroll"');
		const tablistIndex = markup.indexOf('data-slot="tabs-list"');

		expect(markup).toContain('aria-label="Record sections"');
		expect(markup).toContain('role="tablist"');
		expect(scrollerIndex).toBeGreaterThanOrEqual(0);
		expect(tablistIndex).toBeGreaterThan(scrollerIndex);
	});
});

import { WorkspaceMode } from "@crm/db/enums";

export type WorkspaceLabels = {
	acquisition: boolean;
	companies: string;
	company: string;
	companiesLower: string;
	companyLower: string;
	deals: string;
	deal: string;
	dealsLower: string;
	dealLower: string;
};

const SALES_LABELS: WorkspaceLabels = {
	acquisition: false,
	companies: "Companies",
	company: "Company",
	companiesLower: "companies",
	companyLower: "company",
	deals: "Deals",
	deal: "Deal",
	dealsLower: "deals",
	dealLower: "deal",
};

const ACQUISITION_LABELS: WorkspaceLabels = {
	acquisition: true,
	companies: "Targets",
	company: "Target",
	companiesLower: "targets",
	companyLower: "target",
	deals: "Opportunities",
	deal: "Opportunity",
	dealsLower: "opportunities",
	dealLower: "opportunity",
};

export function workspaceLabels(
	mode: WorkspaceMode | null | undefined,
): WorkspaceLabels {
	return mode === WorkspaceMode.ACQUISITION ? ACQUISITION_LABELS : SALES_LABELS;
}

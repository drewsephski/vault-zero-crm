import { describe, expect, it } from "bun:test";
import { WorkspaceMode } from "@crm/db/enums";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceLabel } from "../components/app-header";
import { useHydratedValue } from "../lib/use-hydrated-value";
import { workspaceLabels } from "../lib/workspace-mode";
import { createHydrationEnvironment } from "./react-dom-environment";

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

	it("hydrates the fallback before revealing the acquisition workspace", async () => {
		function WorkspaceIdentity() {
			const workspace = useHydratedValue(
				{ mode: WorkspaceMode.ACQUISITION, name: "Task 8 Workspace" },
				undefined,
			);
			const labels = workspaceLabels(workspace?.mode);
			return createElement(
				"span",
				null,
				`${labels.companies}|${workspaceLabel(workspace?.name)}`,
			);
		}

		const serverMarkup = renderToStaticMarkup(createElement(WorkspaceIdentity));
		expect(serverMarkup).toBe("<span>Companies|Vault Zero CRM</span>");
		const environment = createHydrationEnvironment(
			"span",
			"Companies|Vault Zero CRM",
		);
		const recoverableErrors: string[] = [];

		try {
			const { hydrateRoot } = await import("react-dom/client");
			let root: ReturnType<typeof hydrateRoot> | undefined;
			await act(async () => {
				root = hydrateRoot(
					environment.container as unknown as Element,
					createElement(WorkspaceIdentity),
					{
						onRecoverableError(error) {
							recoverableErrors.push(String(error));
						},
					},
				);
			});

			expect(environment.container.textContent).toBe(
				"Targets|Task 8 Workspace CRM",
			);
			expect(recoverableErrors).toEqual([]);
			await act(async () => root?.unmount());
		} finally {
			environment.restore();
		}
	});
});

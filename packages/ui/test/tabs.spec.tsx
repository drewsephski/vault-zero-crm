import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabsList, TabsTrigger } from "../src/components/tabs";

function openingTag(markup: string, slot: string): string {
	const slotIndex = markup.indexOf(`data-slot="${slot}"`);
	const start = markup.lastIndexOf("<", slotIndex);
	const end = markup.indexOf(">", slotIndex);
	return markup.slice(start, end + 1);
}

describe("TabsList", () => {
	it("keeps a scrollable line tablist inside a safe overflow wrapper", () => {
		const markup = renderToStaticMarkup(
			<Tabs defaultValue="overview">
				<TabsList variant="line" scrollable aria-label="Record sections">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="acquisition">Acquisition</TabsTrigger>
				</TabsList>
			</Tabs>,
		);
		const scroller = openingTag(markup, "tabs-list-scroll");
		const tablist = openingTag(markup, "tabs-list");

		expect(markup.indexOf(scroller)).toBeLessThan(markup.indexOf(tablist));
		expect(
			markup.slice(
				markup.indexOf(scroller) + scroller.length,
				markup.indexOf(tablist),
			),
		).toBe("");
		expect(scroller).toContain("overflow-x-auto");
		expect(scroller).toContain("scrollbar-none");
		expect(scroller).toContain("pt-0.5");
		expect(scroller).toContain("pb-1.5");
		expect(tablist).toContain('role="tablist"');
		expect(tablist).toContain('aria-label="Record sections"');
		expect(tablist).not.toContain("overflow-x-auto");
		expect(markup).toContain("focus-visible:ring-2");
		expect(markup).toContain("after:bottom-[-5px]");
		expect(markup).toContain("data-active:after:opacity-100");
	});
});

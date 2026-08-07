import { describe, expect, it } from "bun:test";
import createContact from "../agent/tools/create_contact";
import getLinkedInProfile from "../agent/tools/get_linkedin_profile";
import readLinkedInProfile from "../agent/tools/read_linkedin_profile";

describe("agent tool contracts", () => {
	it("accepts an unassigned contact creation request", () => {
		const result = createContact.inputSchema.safeParse({
			firstName: "Drew",
			lastName: null,
			email: null,
			phone: null,
			profileUrl: null,
			companyId: null,
			ownerId: null,
		});

		expect(result.success).toBe(true);
	});

	it("fetches LinkedIn work history by default", () => {
		expect(
			readLinkedInProfile.inputSchema.safeParse({
				profile: "drewsepeczi",
			}).data?.includeHistory,
		).toBe(true);
		expect(
			getLinkedInProfile.inputSchema.safeParse({
				slug: "drewsepeczi",
				email: "drew@example.com",
				companyName: "Example",
				companyDomain: "example.com",
			}).data?.includeHistory,
		).toBe(true);
	});
});

import { search as anySearch } from "./anysearch";
import { ask as tavily } from "./tavily";

export type Profile = {
	slug: string;
	profileUrl: string | null;
	fullName: string | null;
	firstName: string | null;
	lastName: string | null;
	headline: string | null;
	location: string | null;
	urn: string | null;
	followerCount: number | null;
	connectionsCount: number | null;
	photoUrl: string | null;
	positions: { name: string; url: string | null }[];
};

export type Experience = {
	title: string | null;
	company: string | null;
	dateRange: string | null;
	location: string | null;
};
export type PeopleSearchCandidate = {
	slug: string | null;
	profileUrl: string | null;
	fullName: string | null;
	headline: string | null;
	location: string | null;
	urn: string | null;
	photoUrl: string | null;
};
type Outcome<T> =
	| { ok: true; data: T }
	| { ok: false; missing: true }
	| { ok: false; missing: false; reason: string };

export function slugFromProfileUrl(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
		if (!url.hostname.endsWith("linkedin.com")) return null;
		const [section, slug] = url.pathname.split("/").filter(Boolean);
		return section === "in" && slug ? decodeURIComponent(slug) : null;
	} catch {
		return null;
	}
}

export function slugFromLinkedinInput(raw: string): string | null {
	const trimmed = raw.trim();
	return (
		slugFromProfileUrl(trimmed) ??
		(/^[A-Za-z0-9][A-Za-z0-9_%-]{2,100}$/.test(trimmed) ? trimmed : null)
	);
}

function profile(slug: string, text: string): Profile {
	const title = text.split("\n").find((line) => line.trim()) ?? slug;
	const fullName = title.replace(/\s*\|.*$/, "").trim() || null;
	return {
		slug,
		profileUrl: `https://www.linkedin.com/in/${slug}`,
		fullName,
		firstName: fullName?.split(" ")[0] ?? null,
		lastName: fullName?.split(" ").slice(1).join(" ") || null,
		headline: null,
		location: null,
		urn: null,
		followerCount: null,
		connectionsCount: null,
		photoUrl: null,
		positions: [],
	};
}

async function web(query: string): Promise<{ text: string; url: string }[]> {
	const [tavilyResult, anyResult] = await Promise.all([
		tavily(query, {
			domains: ["linkedin.com"],
			maxResults: 5,
			includeRawContent: "markdown",
		}),
		anySearch(query, { maxResults: 5 }),
	]);
	const rows = [
		...(tavilyResult.ok ? tavilyResult.data.sources : []),
		...(anyResult.ok ? anyResult.data.sources : []),
	];
	return rows.map((row) => ({
		text: `${row.title}\n${row.content}`,
		url: row.url,
	}));
}

export async function getProfile(slug: string): Promise<Outcome<Profile>> {
	const rows = await web(`site:linkedin.com/in/${slug} LinkedIn profile`);
	const row = rows.find((item) => slugFromProfileUrl(item.url) === slug);
	return row
		? { ok: true, data: profile(slug, row.text) }
		: { ok: false, missing: true };
}

export async function getProfileByUrn(_urn: string): Promise<Outcome<Profile>> {
	return { ok: false, missing: true };
}
export async function getExperience(
	_urn: string,
): Promise<Outcome<Experience[]>> {
	return { ok: true, data: [] };
}

export async function searchPeople(input: {
	keyword?: string;
	firstName?: string;
	lastName?: string;
	title?: string;
	currentCompany?: string;
	count?: number;
}): Promise<Outcome<PeopleSearchCandidate[]>> {
	const query = [
		input.keyword,
		input.firstName,
		input.lastName,
		input.title,
		input.currentCompany,
	]
		.filter(Boolean)
		.join(" ");
	const rows = await web(`site:linkedin.com/in ${query}`);
	const candidates = rows.flatMap((row) => {
		const slug = slugFromProfileUrl(row.url);
		return slug
			? [
					{
						slug,
						profileUrl: row.url,
						fullName: row.text.split("\n")[0] ?? null,
						headline: null,
						location: null,
						urn: null,
						photoUrl: null,
					},
				]
			: [];
	});
	return { ok: true, data: candidates.slice(0, input.count ?? 10) };
}

export async function lookupCompany(
	query: string,
): Promise<Outcome<{ id: string; displayName: string }[]>> {
	const rows = await web(`${query} company LinkedIn`);
	return {
		ok: true,
		data: rows.slice(0, 5).map((row) => ({
			id: row.url,
			displayName: row.text.split("\n")[0] ?? query,
		})),
	};
}

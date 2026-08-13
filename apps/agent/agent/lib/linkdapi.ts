import { createHash } from "node:crypto";

const HOST = "linkdapi-best-unofficial-linkedin-api.p.rapidapi.com";
const TIMEOUT_MS = 20_000;
const MAX_SHORT_RETRY_MS = 2_000;
const DEFAULT_LIMIT_COOLDOWN_MS = 60_000;
const MAX_LIMIT_COOLDOWN_MS = 5 * 60_000;

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

export type Company = {
	id: string | null;
	name: string | null;
	universalName: string | null;
	tagline: string | null;
	description: string | null;
	linkedinUrl: string | null;
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
	| {
			ok: false;
			missing: false;
			reason: string;
			code?: "rate_limited";
			retryAfterSeconds?: number;
	  };

type ActiveLimit = {
	until: number;
};

const activeLimits = new Map<string, ActiveLimit>();

function key(): string | null {
	const value = process.env.RAPIDAPI_KEY?.trim();
	return value || null;
}

export function linkedinEnabled(): boolean {
	return key() !== null;
}

export function slugFromProfileUrl(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());

		const host = url.hostname.toLowerCase();
		if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

		const [section, slug] = url.pathname.split("/").filter(Boolean);
		if (section !== "in" || !slug) return null;

		return decodeURIComponent(slug);
	} catch {
		return null;
	}
}

export function slugFromLinkedinInput(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const fromUrl = slugFromProfileUrl(
		trimmed.includes("://") ? trimmed : `https://${trimmed}`,
	);
	if (fromUrl) return fromUrl;

	if (!/^[A-Za-z0-9][A-Za-z0-9_%-]{2,100}$/.test(trimmed)) return null;

	try {
		return decodeURIComponent(trimmed);
	} catch {
		return null;
	}
}

export async function getProfile(slug: string): Promise<Outcome<Profile>> {
	const result = await call<RawProfile>("/api/v1/profile/overview", {
		username: slug,
	});
	if (!result.ok) return result;

	return { ok: true, data: profileFrom(result.data, slug) };
}

export async function getProfileByUrn(urn: string): Promise<Outcome<Profile>> {
	const result = await call<RawProfile>("/api/v1/profile/full", { urn });
	if (!result.ok) return result;

	const slug =
		linkedinSlug(
			str(result.data.username) ??
				str(result.data.publicIdentifier) ??
				str(result.data.vanityName),
		) ?? "";
	return { ok: true, data: profileFrom(result.data, slug) };
}

function profileFrom(raw: RawProfile, slug: string): Profile {
	return {
		slug,
		profileUrl: slug ? `https://www.linkedin.com/in/${slug}` : null,
		fullName: str(raw.fullName),
		firstName: str(raw.firstName),
		lastName: str(raw.lastName),
		headline: str(raw.headline),
		location: locationText(raw.location),
		urn: str(raw.urn),
		followerCount: int(raw.followerCount),
		connectionsCount: int(raw.connectionsCount),
		photoUrl: profilePhotoUrl(raw),
		positions: positionRows(raw).flatMap((position) =>
			position.name ? [{ name: position.name, url: str(position.url) }] : [],
		),
	};
}

export async function getExperience(
	urn: string,
): Promise<Outcome<Experience[]>> {
	const result = await call<RawExperience>("/api/v1/profile/full-experience", {
		urn,
	});
	if (!result.ok) return result;

	const payload = result.data;
	const rows: RawExperienceRow[] = Array.isArray(payload)
		? payload
		: (payload.experience ?? payload.experiences ?? []);

	return {
		ok: true,
		data: rows.map(
			(row): Experience => ({
				title: str(row?.title),
				company: str(row?.companyName ?? row?.company),
				dateRange: str(row?.dateRange ?? row?.duration),
				location: str(row?.location),
			}),
		),
	};
}

export async function searchPeople(input: {
	keyword?: string;
	firstName?: string;
	lastName?: string;
	title?: string;
	currentCompany?: string;
	count?: number;
}): Promise<Outcome<PeopleSearchCandidate[]>> {
	const params = Object.fromEntries(
		Object.entries({
			keyword: input.keyword,
			firstName: input.firstName,
			lastName: input.lastName,
			title: input.title,
			currentCompany: input.currentCompany,
			count: input.count ?? 10,
		}).flatMap(([key, value]) =>
			value === undefined || value === "" ? [] : [[key, String(value)]],
		),
	) as Record<string, string>;
	const result = await call<RawPeopleSearch>("/api/v1/search/people", params);
	if (!result.ok) return result;

	return {
		ok: true,
		data: peopleFrom(result.data)
			.map(searchCandidate)
			.flatMap((candidate) => (candidate ? [candidate] : [])),
	};
}

export async function lookupCompany(
	query: string,
): Promise<Outcome<{ id: string; displayName: string }[]>> {
	const result = await call<RawLookup>("/api/v1/companies/name-lookup", {
		query,
	});
	if (!result.ok) return result;

	return {
		ok: true,
		data: (result.data.companies ?? []).flatMap((c) =>
			c?.id ? [{ id: c.id, displayName: c.displayName ?? c.id }] : [],
		),
	};
}

export async function getCompany(nameOrId: string): Promise<Outcome<Company>> {
	const numeric = /^\d+$/.test(nameOrId);
	const result = await call<RawCompany>("/api/v1/companies/company/info", {
		[numeric ? "id" : "name"]: nameOrId,
	});
	if (!result.ok) return result;

	const d = result.data;
	return {
		ok: true,
		data: {
			id: str(d.id),
			name: str(d.name),
			universalName: str(d.universalName),
			tagline: str(d.tagline),
			description: str(d.description),
			linkedinUrl: str(d.linkedinUrl),
		},
	};
}

async function call<T>(
	path: string,
	params: Record<string, string>,
): Promise<Outcome<T>> {
	const apiKey = key();
	if (!apiKey) return { ok: false, missing: false, reason: "No RAPIDAPI_KEY." };
	const scope = limitScope(path);
	const limitKey = `${credentialFingerprint(apiKey)}:${scope.key}`;
	const activeLimit = activeLimits.get(limitKey);
	if (activeLimit) {
		const remainingMs = activeLimit.until - Date.now();
		if (remainingMs > 0) {
			return rateLimited(scope.label, Math.ceil(remainingMs / 1_000));
		}
		activeLimits.delete(limitKey);
	}

	const url = new URL(`https://${HOST}${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await fetch(url, {
				headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": apiKey },
				signal: controller.signal,
			});

			if (response.status === 429) {
				const retryMs = retryDelayMs(response.headers);
				if (
					attempt === 0 &&
					retryMs !== null &&
					retryMs <= MAX_SHORT_RETRY_MS
				) {
					await new Promise((resolve) => setTimeout(resolve, retryMs));
					continue;
				}

				const cooldownMs = Math.min(
					Math.max(retryMs ?? DEFAULT_LIMIT_COOLDOWN_MS, 1_000),
					MAX_LIMIT_COOLDOWN_MS,
				);
				const retryAfterSeconds = Math.ceil(cooldownMs / 1_000);
				activeLimits.set(limitKey, {
					until: Date.now() + cooldownMs,
				});
				return rateLimited(scope.label, retryAfterSeconds);
			}

			if (!response.ok) {
				return {
					ok: false,
					missing: false,
					reason: `HTTP ${response.status}`,
				};
			}

			const body = (await response.json()) as {
				success?: boolean;
				data?: T | null;
			};

			if (body.success !== true || body.data == null) {
				return { ok: false, missing: true };
			}

			activeLimits.delete(limitKey);
			return { ok: true, data: body.data };
		}

		return rateLimited(scope.label, 1);
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			missing: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

function credentialFingerprint(apiKey: string): string {
	return createHash("sha256").update(apiKey).digest("base64url");
}

function limitScope(path: string): { key: string; label: string } {
	if (path.includes("/search/")) {
		return { key: "search", label: "LinkedIn search requests" };
	}
	if (path.includes("/profile/")) {
		return { key: "profile", label: "LinkedIn profile requests" };
	}
	if (path.includes("/companies/")) {
		return { key: "companies", label: "LinkedIn company requests" };
	}
	if (path.includes("/jobs/")) {
		return { key: "jobs", label: "LinkedIn job requests" };
	}
	return { key: "other", label: "LinkedIn requests" };
}

function retryDelayMs(headers: Headers): number | null {
	const retryAfter = headers.get("retry-after")?.trim();
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

		const date = Date.parse(retryAfter);
		if (Number.isFinite(date)) return Math.max(date - Date.now(), 0);
	}

	for (const name of [
		"x-ratelimit-search-reset",
		"x-ratelimit-profile-reset",
		"x-ratelimit-requests-reset",
	]) {
		const raw = headers.get(name)?.trim();
		if (!raw) continue;
		const seconds = Number(raw);
		if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
	}

	return null;
}

function rateLimited(label: string, retryAfterSeconds: number): Outcome<never> {
	const duration =
		retryAfterSeconds < 60
			? `about ${retryAfterSeconds} seconds`
			: `about ${Math.ceil(retryAfterSeconds / 60)} minutes`;
	return {
		ok: false,
		missing: false,
		code: "rate_limited",
		retryAfterSeconds,
		reason: `${label} are rate-limited by the provider for ${duration}. Retrying immediately will not help; use another configured source or try again later.`,
	};
}

type RawProfile = {
	username?: unknown;
	publicIdentifier?: unknown;
	vanityName?: unknown;
	fullName?: unknown;
	firstName?: unknown;
	lastName?: unknown;
	headline?: unknown;
	location?: unknown;
	urn?: unknown;
	followerCount?: unknown;
	connectionsCount?: unknown;
	CurrentPositions?: { name?: string; url?: unknown }[] | null;
} & Record<string, unknown>;

function positionRows(raw: RawProfile): { name?: string; url?: unknown }[] {
	const candidates = [
		raw.CurrentPositions,
		raw.currentPositions,
		raw.positions,
	];
	for (const value of candidates) {
		if (!Array.isArray(value)) continue;
		return value.filter(
			(entry): entry is { name?: string; url?: unknown } =>
				Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
		);
	}
	return [];
}

const PHOTO_KEYS = [
	"profilePictureURL",
	"profilePicture",
	"profilePictureUrl",
	"profilePicUrl",
	"profilePic",
	"profilePicHighQuality",
	"profilePhotoUrl",
	"profilePhoto",
	"pictureUrl",
	"avatarUrl",
	"avatar",
];

export function profilePhotoUrl(raw: Record<string, unknown>): string | null {
	const byLowerKey = new Map<string, unknown>();
	for (const [key, value] of Object.entries(raw)) {
		byLowerKey.set(key.toLowerCase(), value);
	}

	for (const key of PHOTO_KEYS) {
		const url = firstUrl(byLowerKey.get(key.toLowerCase()));
		if (!url) continue;

		try {
			const { protocol, hostname } = new URL(url);
			if (protocol !== "https:") continue;
			if (hostname !== "licdn.com" && !hostname.endsWith(".licdn.com"))
				continue;
			return url;
		} catch {}
	}

	return null;
}

function firstUrl(value: unknown): string | null {
	if (typeof value === "string") return str(value);

	if (Array.isArray(value)) {
		for (const entry of [...value].reverse()) {
			const found = firstUrl(entry);
			if (found) return found;
		}
		return null;
	}

	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		for (const key of ["url", "displayUrl", "src", "large", "original"]) {
			const found = firstUrl(record[key]);
			if (found) return found;
		}
	}

	return null;
}

type RawExperienceRow = {
	title?: unknown;
	companyName?: unknown;
	company?: unknown;
	dateRange?: unknown;
	duration?: unknown;
	location?: unknown;
};

type RawExperience =
	| RawExperienceRow[]
	| { experience?: RawExperienceRow[]; experiences?: RawExperienceRow[] };
type RawLookup = { companies?: { id?: string; displayName?: string }[] | null };
type RawPeopleSearch = Record<string, unknown> | unknown[];
type RawCompany = {
	id?: unknown;
	name?: unknown;
	universalName?: unknown;
	tagline?: unknown;
	description?: unknown;
	linkedinUrl?: unknown;
};

function peopleFrom(value: RawPeopleSearch): Record<string, unknown>[] {
	if (Array.isArray(value)) {
		return value.filter(
			(entry): entry is Record<string, unknown> =>
				Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
		);
	}

	for (const key of ["people", "profiles", "results", "items"]) {
		const entries = value[key];
		if (Array.isArray(entries)) return peopleFrom(entries);
	}

	const nested = value.data;
	if (nested && typeof nested === "object" && !Array.isArray(nested)) {
		return peopleFrom(nested as Record<string, unknown>);
	}

	return [];
}

function searchCandidate(
	raw: Record<string, unknown>,
): PeopleSearchCandidate | null {
	const profileUrl = firstHttpUrl([raw.profileUrl, raw.linkedinUrl, raw.url]);
	const slug =
		slugFromProfileUrl(profileUrl) ??
		linkedinSlug(
			str(raw.username) ?? str(raw.publicIdentifier) ?? str(raw.vanityName),
		);

	if (!slug && !str(raw.urn)) return null;

	return {
		slug,
		profileUrl: slug ? `https://www.linkedin.com/in/${slug}` : profileUrl,
		fullName: str(raw.fullName ?? raw.name),
		headline: str(raw.headline ?? raw.title),
		location: locationText(raw.location),
		urn: str(raw.urn),
		photoUrl: profilePhotoUrl(raw),
	};
}

function linkedinSlug(value: string | null): string | null {
	if (!value) return null;
	const slug = value.trim().replace(/^\/+|\/+$/g, "");
	return /^[A-Za-z0-9][A-Za-z0-9_%~-]*$/.test(slug) ? slug : null;
}

function firstHttpUrl(values: unknown[]): string | null {
	for (const value of values) {
		const candidate = str(value);
		if (!candidate) continue;
		try {
			const url = new URL(candidate);
			if (
				url.protocol === "https:" &&
				(url.hostname === "linkedin.com" ||
					url.hostname.endsWith(".linkedin.com"))
			) {
				return url.toString();
			}
		} catch {}
	}
	return null;
}

function locationText(value: unknown): string | null {
	const direct = str(value);
	if (direct) return direct;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	return (
		str(record.name) ??
		str(record.city) ??
		([record.city, record.region, record.country]
			.filter(
				(part): part is string =>
					typeof part === "string" && Boolean(part.trim()),
			)
			.join(", ") ||
			null)
	);
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function int(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

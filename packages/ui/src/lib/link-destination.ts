export type LinkDestination = {
	action: string;
	description: string;
	display: string;
	label: string;
	title: string;
	type: "email" | "phone" | "web" | "other";
};

function decode(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function describeLinkDestination(url: string): LinkDestination {
	if (url.toLowerCase().startsWith("mailto:")) {
		const address = url.slice(url.indexOf(":") + 1).split("?", 1)[0] ?? "";
		return {
			action: "Compose email",
			description: "Opens your default email app.",
			display: decode(address),
			label: "Email address",
			title: "Compose email?",
			type: "email",
		};
	}

	if (url.toLowerCase().startsWith("tel:")) {
		const number = url.slice(url.indexOf(":") + 1).split("?", 1)[0] ?? "";
		return {
			action: "Start call",
			description: "Opens your default calling app.",
			display: decode(number),
			label: "Phone number",
			title: "Start a call?",
			type: "phone",
		};
	}

	try {
		const destination = new URL(url);
		if (destination.protocol === "http:" || destination.protocol === "https:") {
			return {
				action: "Open website",
				description: "Opens outside Vault Zero CRM in a new tab.",
				display: url,
				label: destination.host,
				title: "Open external website?",
				type: "web",
			};
		}
	} catch {}

	return {
		action: "Open link",
		description: "Opens outside Vault Zero CRM.",
		display: url,
		label: "Destination",
		title: "Open external link?",
		type: "other",
	};
}

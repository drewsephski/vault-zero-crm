export const ANALYTICS_HOSTS: readonly string[] = [
	"vaultzero.dev",
	"www.vaultzero.dev",
	"crm.vaultzero.dev",
	"trycrm.ai",
	"www.trycrm.ai",
];

export function analyticsAllowed(hostname: string): boolean {
	return ANALYTICS_HOSTS.includes(hostname.trim().toLowerCase());
}

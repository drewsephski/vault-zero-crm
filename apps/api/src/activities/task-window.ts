export function taskDayWindow(now: Date, timezoneOffset: number) {
	const local = new Date(now.getTime() - timezoneOffset * 60_000);
	local.setUTCHours(0, 0, 0, 0);
	const start = new Date(local.getTime() + timezoneOffset * 60_000);
	const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	return { start, end };
}

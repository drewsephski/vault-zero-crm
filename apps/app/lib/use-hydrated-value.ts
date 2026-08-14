"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydratedValue<T>(value: T, fallback: T): T {
	return useSyncExternalStore(
		emptySubscribe,
		getClientSnapshot,
		getServerSnapshot,
	)
		? value
		: fallback;
}

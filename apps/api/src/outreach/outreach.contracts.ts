import { OutreachStatus } from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const statusEnum = z.enum(
	Object.values(OutreachStatus) as [OutreachStatus, ...OutreachStatus[]],
);

export const outreachListInput = listInput.extend({
	status: z.string().default("all"),
	vertical: z.string().default("all"),
	owner: z.string().default("all"),
});

export type OutreachListInput = z.infer<typeof outreachListInput>;

export const outreachStatusInput = z.object({
	id: z.string().min(1),
	status: statusEnum,
	lastNote: z.string().trim().max(5000).nullable().optional(),
});

export type OutreachStatusInput = z.infer<typeof outreachStatusInput>;

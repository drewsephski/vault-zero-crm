import { z } from "zod";

const recipients = z.array(z.email().max(254)).min(1).max(20);

export const emailSendInput = z.object({
	idempotencyKey: z.string().min(16).max(200),
	userId: z.string().min(1),
	organizationId: z.string().min(1),
	to: recipients,
	cc: z.array(z.email().max(254)).max(20).default([]),
	subject: z
		.string()
		.trim()
		.min(1)
		.max(998)
		.refine((value) => !/[\r\n]/.test(value)),
	body: z.string().trim().min(1).max(100_000),
	crmThreadId: z.string().min(1).optional(),
});

export type EmailSendInput = z.infer<typeof emailSendInput>;

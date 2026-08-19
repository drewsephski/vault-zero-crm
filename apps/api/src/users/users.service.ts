import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export interface UserOption {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

@Injectable()
export class UsersService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(organizationId: string): Promise<UserOption[]> {
		const members = await this.db.member.findMany({
			where: { organizationId },
			select: {
				user: {
					select: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
		});

		return members.map((member) => member.user);
	}
}

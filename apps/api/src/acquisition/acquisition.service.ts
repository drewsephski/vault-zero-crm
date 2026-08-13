import {
	AcquisitionCandidateStatus,
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	type Db,
	RecordSource,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { CompaniesService } from "../companies/companies.service";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class AcquisitionService {
	private readonly logger = new Logger(AcquisitionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
	) {}

	async approveCandidate(id: string, actingUserId: string) {
		const candidate = await this.db.acquisitionCandidate.findUnique({
			where: { id },
		});

		if (!candidate) {
			throw new NotFoundException("That discovery candidate no longer exists.");
		}

		if (candidate.status === AcquisitionCandidateStatus.DISMISSED) {
			throw new BadRequestException(
				"This candidate was dismissed and cannot be approved.",
			);
		}
		if (candidate.companyId) {
			return {
				candidateId: id,
				companyId: candidate.companyId,
				created: false,
			};
		}

		let existing = await this.db.company.findUnique({
			where: { domain: candidate.domain },
			select: { id: true },
		});

		let created = false;
		if (!existing) {
			try {
				existing = await this.companies.create(
					{ name: candidate.name, domain: candidate.domain },
					RecordSource.DISCOVERY,
				);
				created = true;
			} catch (error) {
				if (!(error instanceof ConflictException)) throw error;
				existing = await this.db.company.findUnique({
					where: { domain: candidate.domain },
					select: { id: true },
				});
				if (!existing) throw error;
			}
		}

		await this.db.$transaction([
			this.db.acquisitionTarget.upsert({
				where: { companyId: existing.id },
				create: {
					companyId: existing.id,
					stage: AcquisitionStage.RESEARCHING,
					fit: AcquisitionFit.UNKNOWN,
					strengths: [],
					concerns: [],
					missingInformation: [],
					sourceUrls: [candidate.sourceUrl],
				},
				update: {},
			}),
			this.db.acquisitionCandidate.update({
				where: { id },
				data: {
					status: created
						? AcquisitionCandidateStatus.APPROVED
						: AcquisitionCandidateStatus.DUPLICATE,
					companyId: existing.id,
				},
			}),
		]);
		if (!created) {
			await this.companies.research(existing.id, actingUserId);
		}

		this.logger.log({
			message: "Acquisition candidate approved",
			candidateId: id,
			companyId: existing.id,
			created,
		});

		return { candidateId: id, companyId: existing.id, created };
	}

	async dismissCandidate(id: string) {
		const result = await this.db.acquisitionCandidate.updateMany({
			where: { id, status: AcquisitionCandidateStatus.PROPOSED },
			data: { status: AcquisitionCandidateStatus.DISMISSED },
		});

		if (result.count === 0) {
			const exists = await this.db.acquisitionCandidate.findUnique({
				where: { id },
				select: { status: true },
			});
			if (!exists) {
				throw new NotFoundException(
					"That discovery candidate no longer exists.",
				);
			}
			throw new BadRequestException(
				"Only proposed candidates can be dismissed.",
			);
		}

		this.logger.log({
			message: "Acquisition candidate dismissed",
			candidateId: id,
		});

		return { id, dismissed: true as const };
	}

	async updateTarget(
		companyId: string,
		stage: AcquisitionStage,
		actingUserId: string,
	) {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				acquisitionTarget: { select: { stage: true } },
			},
		});
		if (!company) throw new NotFoundException("That target no longer exists.");

		const target = await this.db.$transaction(async (tx) => {
			const updated = await tx.acquisitionTarget.upsert({
				where: { companyId },
				create: {
					companyId,
					stage,
					fit: AcquisitionFit.UNKNOWN,
					strengths: [],
					concerns: [],
					missingInformation: [],
					sourceUrls: [],
				},
				update: { stage },
				select: { companyId: true, stage: true, updatedAt: true },
			});
			if (company.acquisitionTarget?.stage !== stage) {
				await tx.activity.create({
					data: {
						type: ActivityType.STAGE_CHANGE,
						subject: `Moved ${company.name} to ${stage.toLowerCase()}`,
						companyId,
						createdById: actingUserId,
					},
				});
			}
			return updated;
		});

		this.logger.log({
			message: "Acquisition target stage changed",
			companyId,
			stage,
			actingUserId,
		});

		return { ...target, updatedAt: target.updatedAt.toISOString() };
	}
}

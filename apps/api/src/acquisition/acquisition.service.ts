import {
	AcquisitionCandidateStatus,
	AcquisitionFit,
	AcquisitionStage,
	ActivityType,
	type Db,
	RecordSource,
} from "@crm/db";
import { hasAcquisitionFocus } from "@crm/db/acquisition";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { CompanyCreateInput } from "../companies/companies.contracts";
import { CompaniesService } from "../companies/companies.service";
import { normalizeDomain } from "../companies/domain";
import { InjectDatabase } from "../database/database.constants";
import type {
	TargetMutationResult,
	TargetResearchResult,
} from "./acquisition.contracts";

function acquisitionTargetData(sourceUrls: string[]) {
	return {
		stage: AcquisitionStage.DISCOVERED,
		fit: AcquisitionFit.UNKNOWN,
		strengths: [],
		concerns: [],
		missingInformation: [],
		sourceUrls,
	};
}

@Injectable()
export class AcquisitionService {
	private readonly logger = new Logger(AcquisitionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompaniesService,
		private readonly agent: AgentTriggerService,
	) {}

	async createTarget(
		input: CompanyCreateInput,
		actingUserId: string,
	): Promise<TargetMutationResult> {
		const domain = normalizeDomain(input.domain);
		let company: { id: string };
		try {
			company = await this.companies.create(
				input,
				RecordSource.MANUAL,
				acquisitionTargetData([]),
			);
		} catch (error) {
			if (!(error instanceof ConflictException) || !domain) throw error;
			const winner = await this.db.company.findUnique({
				where: { domain },
				select: { id: true },
			});
			if (!winner) throw error;
			return this.addTarget(winner.id, actingUserId);
		}

		return this.targetResult(company.id, actingUserId, true, true);
	}

	async addTarget(
		companyId: string,
		actingUserId: string,
	): Promise<TargetMutationResult> {
		const targetCreated = await this.ensureTarget(companyId, []);
		return this.targetResult(companyId, actingUserId, false, targetCreated);
	}

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
			const result = await this.addTarget(candidate.companyId, actingUserId);
			return { candidateId: id, ...result };
		}

		let existing = await this.db.company.findUnique({
			where: { domain: candidate.domain },
			select: { id: true, source: true },
		});

		let created = false;
		let targetCreated = false;
		if (!existing) {
			try {
				const company = await this.companies.create(
					{ name: candidate.name, domain: candidate.domain },
					RecordSource.DISCOVERY,
					acquisitionTargetData([candidate.sourceUrl]),
				);
				existing = { id: company.id, source: RecordSource.DISCOVERY };
				created = true;
				targetCreated = true;
			} catch (error) {
				if (!(error instanceof ConflictException)) throw error;
				existing = await this.db.company.findUnique({
					where: { domain: candidate.domain },
					select: { id: true, source: true },
				});
				if (!existing) throw error;
			}
		}

		if (!targetCreated) {
			targetCreated = await this.ensureTarget(existing.id, [
				candidate.sourceUrl,
			]);
		}

		const status =
			existing.source === RecordSource.DISCOVERY
				? AcquisitionCandidateStatus.APPROVED
				: AcquisitionCandidateStatus.DUPLICATE;
		await this.db.acquisitionCandidate.updateMany({
			where: { id, companyId: null },
			data: { status, companyId: existing.id },
		});
		const linked = await this.db.acquisitionCandidate.findUnique({
			where: { id },
			select: { companyId: true },
		});
		if (!linked) {
			throw new NotFoundException("That discovery candidate no longer exists.");
		}
		if (linked.companyId !== existing.id) {
			throw new ConflictException(
				"That candidate was approved to a different company.",
			);
		}

		const result = await this.targetResult(
			existing.id,
			actingUserId,
			created,
			targetCreated,
		);

		this.logger.log({
			message: "Acquisition candidate approved",
			candidateId: id,
			companyId: existing.id,
			created,
		});

		return { candidateId: id, ...result };
	}

	private async ensureTarget(
		companyId: string,
		sourceUrls: string[],
	): Promise<boolean> {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: { id: true },
		});
		if (!company) throw new NotFoundException("That company no longer exists.");

		const result = await this.db.acquisitionTarget.createMany({
			data: [{ companyId, ...acquisitionTargetData(sourceUrls) }],
			skipDuplicates: true,
		});

		return result.count === 1;
	}

	private async targetResult(
		companyId: string,
		actingUserId: string,
		created: boolean,
		targetCreated: boolean,
	): Promise<TargetMutationResult> {
		const research = await this.queueResearch(companyId, actingUserId);
		const target = await this.db.acquisitionTarget.findUniqueOrThrow({
			where: { companyId },
			select: { stage: true },
		});

		return {
			companyId,
			created,
			targetCreated,
			stage: target.stage,
			research,
		};
	}

	private async queueResearch(
		companyId: string,
		actingUserId: string,
	): Promise<TargetResearchResult> {
		const readiness = await this.targetReadiness(companyId);
		if (readiness.blocker) {
			return { status: "blocked", blocker: readiness.blocker };
		}

		let queued: { taskId: string } | null;
		try {
			queued = await this.agent.acquisitionTargetRequested(
				companyId,
				`Acquisition analysis requested by a rep (${actingUserId})`,
			);
		} catch {
			queued = null;
		}
		if (!queued) return { status: "failed", blocker: "queue-unavailable" };

		await this.db.acquisitionTarget.updateMany({
			where: { companyId, stage: AcquisitionStage.DISCOVERED },
			data: { stage: AcquisitionStage.RESEARCHING },
		});

		return { status: "queued", taskId: queued.taskId };
	}

	private async targetReadiness(companyId: string): Promise<{
		blocker?: "missing-domain" | "missing-buy-box";
	}> {
		const [company, profile] = await Promise.all([
			this.db.company.findUnique({
				where: { id: companyId },
				select: { domain: true },
			}),
			this.db.acquisitionProfile.findUnique({
				where: { id: WORKSPACE_ID },
				select: { preferredIndustries: true, geographies: true },
			}),
		]);

		if (!company) throw new NotFoundException("That company no longer exists.");
		if (!normalizeDomain(company.domain)) return { blocker: "missing-domain" };
		if (!profile || !hasAcquisitionFocus(profile)) {
			return { blocker: "missing-buy-box" };
		}
		return {};
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
		if (!company.acquisitionTarget) {
			throw new NotFoundException("That target no longer exists.");
		}

		const target = await this.db.$transaction(async (tx) => {
			const { count } = await tx.acquisitionTarget.updateMany({
				where: { companyId },
				data: { stage },
			});
			if (count === 0) {
				throw new NotFoundException("That target no longer exists.");
			}
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
			return tx.acquisitionTarget.findUniqueOrThrow({
				where: { companyId },
				select: { companyId: true, stage: true, updatedAt: true },
			});
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

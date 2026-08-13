import type { Prisma } from "@crm/db";
import { type AcquisitionTargetView, targetStages } from "@crm/db/acquisition";

function targetStageWhere(
	view: AcquisitionTargetView,
): Prisma.AcquisitionTargetWhereInput {
	const stages = targetStages(view);
	if (stages === null) return {};
	if (stages.length === 1) return { stage: stages[0] };
	return { stage: { in: [...stages] } };
}

export function companyTargetWhere(
	view: AcquisitionTargetView,
	baseCompanyWhere: Prisma.CompanyWhereInput,
): Prisma.CompanyWhereInput {
	return {
		AND: [
			baseCompanyWhere,
			{ acquisitionTarget: { is: targetStageWhere(view) } },
		],
	};
}

export function acquisitionTargetWhere(
	view: AcquisitionTargetView,
	companyWhere: Prisma.CompanyWhereInput,
): Prisma.AcquisitionTargetWhereInput {
	return {
		...targetStageWhere(view),
		company: { is: companyWhere },
	};
}

import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AcquisitionRouter } from "./acquisition.router";
import { AcquisitionService } from "./acquisition.service";

@Module({
	imports: [TrpcModule, CompaniesModule],
	providers: [AcquisitionService, AcquisitionRouter],
})
export class AcquisitionModule {}

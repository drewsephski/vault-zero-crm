import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { CurrencyModule } from "../currency/currency.module";
import { TrpcModule } from "../trpc/trpc.module";
import { AcquisitionRouter } from "./acquisition.router";
import { AcquisitionService } from "./acquisition.service";

@Module({
	imports: [TrpcModule, CompaniesModule, AgentModule, CurrencyModule],
	providers: [AcquisitionService, AcquisitionRouter],
})
export class AcquisitionModule {}

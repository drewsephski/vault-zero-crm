import { Module } from "@nestjs/common";
import { CurrencyModule } from "../currency/currency.module";
import { VaultZeroController } from "./vault-zero.controller";
import { VaultZeroService } from "./vault-zero.service";

@Module({
	imports: [CurrencyModule],
	controllers: [VaultZeroController],
	providers: [VaultZeroService],
})
export class VaultZeroModule {}

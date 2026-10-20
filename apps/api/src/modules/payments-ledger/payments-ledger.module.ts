import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';

import { AdminLedgerController } from './admin-ledger.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { MockPaymentGateway } from './mock-payment.gateway';
import { PaymentAttemptsRepository } from './payment-attempts.repository';
import { PAYMENT_GATEWAY } from './payment-gateway.port';
import { PaymentsService } from './payments.service';
import { PayoutsRepository } from './payouts.repository';
import { PayoutsService } from './payouts.service';
import { SellerFinanceController } from './seller-finance.controller';

@Module({
  imports: [SellersModule],
  controllers: [SellerFinanceController, AdminLedgerController],
  providers: [
    LedgerRepository,
    LedgerService,
    PaymentAttemptsRepository,
    PaymentsService,
    PayoutsRepository,
    PayoutsService,
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  exports: [LedgerService, PaymentsService, PayoutsService],
})
export class PaymentsLedgerModule {}

import { Module } from '@nestjs/common';

import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { MockPaymentGateway } from './mock-payment.gateway';
import { PaymentAttemptsRepository } from './payment-attempts.repository';
import { PAYMENT_GATEWAY } from './payment-gateway.port';
import { PaymentsService } from './payments.service';

@Module({
  providers: [
    LedgerRepository,
    LedgerService,
    PaymentAttemptsRepository,
    PaymentsService,
    { provide: PAYMENT_GATEWAY, useClass: MockPaymentGateway },
  ],
  exports: [LedgerService, PaymentsService],
})
export class PaymentsLedgerModule {}

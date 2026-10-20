import { Module } from '@nestjs/common';

import { PaymentsLedgerModule } from './payments-ledger.module';
import { PaymentsProcessor } from './payments.processor';
import { PayoutsProcessor } from './payouts.processor';

/** The payment queue consumer; registered in the worker process only. */
@Module({ imports: [PaymentsLedgerModule], providers: [PaymentsProcessor, PayoutsProcessor] })
export class PaymentsLedgerWorkerModule {}

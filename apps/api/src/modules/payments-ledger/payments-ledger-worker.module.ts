import { Module } from '@nestjs/common';

import { PaymentsLedgerModule } from './payments-ledger.module';
import { PaymentsProcessor } from './payments.processor';

/** The payment queue consumer; registered in the worker process only. */
@Module({ imports: [PaymentsLedgerModule], providers: [PaymentsProcessor] })
export class PaymentsLedgerWorkerModule {}

import type { AnyDomainEvent } from '../../outbox/events/domain-event';
import { EVENT_TYPE } from '../../outbox/events/event-types';

import { OrdersSagaProcessor } from './orders-saga.processor';
import type { PaymentSagaService } from './payment-saga.service';
import type { LifecycleOutcome } from './seller-order-lifecycle.service';

/** The processor's protected members, opened up for the test. */
interface Internals {
  handle(event: AnyDomainEvent): Promise<void>;
  runIdempotent(eventId: string, effect: () => Promise<void>): Promise<boolean>;
}

const paymentFailed = {
  id: 'e1',
  type: EVENT_TYPE.PAYMENT_FAILED,
  payload: { sellerOrderId: 'so1', reason: 'DECLINED' },
} as unknown as AnyDomainEvent;

const outcome = { kind: 'cancelled', updated: { id: 'so1' } } as unknown as LifecycleOutcome;

function setup(runIdempotent: Internals['runIdempotent']) {
  const saga = {
    onPaymentFailed: jest.fn().mockResolvedValue(outcome),
    reportCompensation: jest.fn(),
  };
  const processor = new OrdersSagaProcessor(saga as unknown as PaymentSagaService);
  const internals = processor as unknown as Internals;
  internals.runIdempotent = runIdempotent;
  return { saga, internals };
}

describe('OrdersSagaProcessor', () => {
  it('reports the compensation once its transaction has committed', async () => {
    const { saga, internals } = setup(async (_id, effect) => {
      await effect();
      return true;
    });

    await internals.handle(paymentFailed);

    expect(saga.reportCompensation).toHaveBeenCalledTimes(1);
    expect(saga.reportCompensation).toHaveBeenCalledWith(outcome);
  });

  it('reports nothing when the transaction rolls back after the cancellation', async () => {
    const { saga, internals } = setup(async (_id, effect) => {
      await effect();
      throw new Error('commit failed');
    });

    await expect(internals.handle(paymentFailed)).rejects.toThrow('commit failed');

    expect(saga.onPaymentFailed).toHaveBeenCalledTimes(1);
    expect(saga.reportCompensation).not.toHaveBeenCalled();
  });

  it('reports nothing for a redelivered event', async () => {
    const { saga, internals } = setup(() => Promise.resolve(false));

    await internals.handle(paymentFailed);

    expect(saga.onPaymentFailed).not.toHaveBeenCalled();
    expect(saga.reportCompensation).not.toHaveBeenCalled();
  });
});

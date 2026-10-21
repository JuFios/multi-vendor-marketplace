import { MockPaymentGateway } from './mock-payment.gateway';

describe('MockPaymentGateway', () => {
  const request = (sellerOrderId: string) => ({ sellerOrderId, amountCents: 100 });

  it('approves every payment at a failure rate of 0', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 0 });

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => gateway.capture(request(`so${i}`))),
    );

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('declines every payment at a failure rate of 1', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 1 });

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => gateway.capture(request(`so${i}`))),
    );

    expect(results.every((result) => !result.ok)).toBe(true);
  });

  it('answers a repeated seller order with the first outcome', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 0.5 });

    const first = await gateway.capture(request('so1'));
    const repeated = await gateway.capture(request('so1'));

    expect(repeated).toEqual(first);
  });
});

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

  it('answers the same on another worker and after a restart', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `so${i}`);
    const onFirst = await Promise.all(
      ids.map((id) => new MockPaymentGateway({ mockFailureRate: 0.5 }).capture(request(id))),
    );
    const other = new MockPaymentGateway({ mockFailureRate: 0.5 });
    const onSecond = await Promise.all(ids.map((id) => other.capture(request(id))));

    expect(onSecond).toEqual(onFirst);
  });

  it('declines about the configured share', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 0.3 });

    const results = await Promise.all(
      Array.from({ length: 2000 }, (_, i) => gateway.capture(request(`seller-order-${i}`))),
    );
    const declined = results.filter((result) => !result.ok).length / results.length;

    expect(declined).toBeGreaterThan(0.25);
    expect(declined).toBeLessThan(0.35);
  });

  describe('refund', () => {
    const refundRequest = (refundKey: string) => ({
      sellerOrderId: 'so1',
      refundKey,
      amountCents: 100,
    });

    it('approves a refund even when every payment is declined', async () => {
      const gateway = new MockPaymentGateway({ mockFailureRate: 1 });

      expect(await gateway.refund(refundRequest('k1'))).toMatchObject({ ok: true });
    });

    it('answers a repeated key with the first outcome and another key with its own', async () => {
      const gateway = new MockPaymentGateway({ mockFailureRate: 0 });

      const first = await gateway.refund(refundRequest('k1'));

      expect(await gateway.refund(refundRequest('k1'))).toEqual(first);
      expect(await gateway.refund(refundRequest('k2'))).not.toEqual(first);
    });
  });
});

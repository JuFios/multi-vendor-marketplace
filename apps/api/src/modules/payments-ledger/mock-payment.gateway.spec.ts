import { MockPaymentGateway } from './mock-payment.gateway';

describe('MockPaymentGateway', () => {
  it('approves every payment at a failure rate of 0', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 0 });

    const results = await Promise.all(Array.from({ length: 50 }, () => gateway.capture()));

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('declines every payment at a failure rate of 1', async () => {
    const gateway = new MockPaymentGateway({ mockFailureRate: 1 });

    const results = await Promise.all(Array.from({ length: 50 }, () => gateway.capture()));

    expect(results.every((result) => !result.ok)).toBe(true);
  });
});

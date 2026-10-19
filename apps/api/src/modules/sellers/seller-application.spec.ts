import { decideApplication } from './seller-application';

describe('decideApplication', () => {
  it('creates an application for a user without a profile', () => {
    expect(decideApplication(null)).toEqual({ kind: 'create' });
  });

  it('reopens a rejected application', () => {
    expect(decideApplication({ id: 's-1', status: 'REJECTED' })).toEqual({
      kind: 'resubmit',
      applicationId: 's-1',
    });
  });

  it.each(['PENDING', 'APPROVED'] as const)('refuses a second application while %s', (status) => {
    expect(decideApplication({ id: 's-1', status })).toEqual({ kind: 'duplicate' });
  });
});

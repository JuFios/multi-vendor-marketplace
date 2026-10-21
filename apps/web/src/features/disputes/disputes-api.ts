import { api, unwrap } from '../../lib/api/api';
import type { components } from '../../lib/api/schema';

export type Dispute = components['schemas']['DisputeDto'];
export type DisputeDetails = components['schemas']['DisputeDetailsDto'];
export type DisputeMessage = components['schemas']['DisputeMessageDto'];

export function fetchDisputes(page: number) {
  return unwrap(api.GET('/api/disputes', { params: { query: { page, limit: 50 } } }));
}

export function fetchDispute(id: string) {
  return unwrap(api.GET('/api/disputes/{id}', { params: { path: { id } } }));
}

export function openDispute(input: { sellerOrderId: string; reason: string }) {
  return unwrap(api.POST('/api/disputes', { body: input }));
}

export function addDisputeMessage(input: { disputeId: string; text: string }) {
  return unwrap(
    api.POST('/api/disputes/{id}/messages', {
      params: { path: { id: input.disputeId } },
      body: { text: input.text },
    }),
  );
}

import { DisputePage } from '../../features/disputes/dispute-page';
import { DisputesListPage } from '../../features/disputes/disputes-list-page';

export function SellerDisputesPage() {
  return <DisputesListPage basePath="/seller/disputes" />;
}

export function SellerDisputeDetailsPage() {
  return <DisputePage backTo="/seller/disputes" />;
}

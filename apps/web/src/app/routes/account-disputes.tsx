import { DisputePage } from '../../features/disputes/dispute-page';
import { DisputesListPage } from '../../features/disputes/disputes-list-page';

export function AccountDisputesPage() {
  return <DisputesListPage basePath="/account/disputes" />;
}

export function AccountDisputeDetailsPage() {
  return <DisputePage backTo="/account/disputes" />;
}

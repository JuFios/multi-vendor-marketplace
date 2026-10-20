import { NotFoundError } from '../../common/exceptions/app-error';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }
}

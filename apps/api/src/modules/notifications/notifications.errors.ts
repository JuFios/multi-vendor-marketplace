import { NotFoundError } from '../../common/exceptions';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('Notification not found', 'NOTIFICATION_NOT_FOUND');
  }
}

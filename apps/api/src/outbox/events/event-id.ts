import { v7 as uuidv7 } from 'uuid';

/** UUID v7: time-ordered, so ids sort roughly by creation and index well. */
export function newEventId(): string {
  return uuidv7();
}

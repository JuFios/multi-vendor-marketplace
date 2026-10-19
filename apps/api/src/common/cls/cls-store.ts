declare module 'nestjs-cls' {
  interface ClsStore {
    correlationId?: string;
    userId?: string;
    /** Id of the domain event being processed, set while a queue consumer runs. */
    eventId?: string;
  }
}

export {};

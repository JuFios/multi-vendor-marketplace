-- The housekeeping sweeps find old rows by these columns.

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");

-- Published events only: the relay's partial index covers the unpublished ones.
CREATE INDEX "outbox_events_published_idx"
  ON "outbox_events" ("published_at")
  WHERE "published_at" IS NOT NULL;

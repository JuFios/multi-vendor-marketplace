-- A relay claims a batch for a while and publishes it outside any transaction. The claim
-- expires on its own, so a relay that dies mid-batch hands its events back.
ALTER TABLE "outbox_events" ADD COLUMN "claimed_until" TIMESTAMP(3);

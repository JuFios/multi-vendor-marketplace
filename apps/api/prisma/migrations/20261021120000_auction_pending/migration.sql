-- A lot whose product waits for pre-moderation: it takes no bids and its clock starts on approval.
ALTER TYPE "auction_status" ADD VALUE 'PENDING';

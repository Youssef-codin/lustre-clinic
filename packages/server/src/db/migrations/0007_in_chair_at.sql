ALTER TABLE "visits" ADD COLUMN "in_chair_at" timestamp with time zone;
--> statement-breakpoint
-- Visits recorded before this column existed have no seating time. A finished
-- visit is history and its best available answer is the check-in, which is what
-- the chair's bar measured before today and is exactly right for anyone who
-- walked into an empty chair. Live visits are left null on purpose: the queue
-- in front of the chair right now is the case the column was added for, and
-- guessing at it would stamp waiting patients as seated.
UPDATE "visits" SET "in_chair_at" = "checked_in_at" WHERE "completed_at" IS NOT NULL;

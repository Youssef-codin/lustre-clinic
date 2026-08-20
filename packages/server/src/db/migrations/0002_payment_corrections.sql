-- Hand-written, like 0001. A visit that has been checked out can be reopened
-- and corrected, and correcting it sometimes means the money was wrong: 800
-- was recorded and 500 was handed over.
--
-- Payment rows are the record of what moved, so a correction adds a row rather
-- than editing or deleting one — a refund of 300 is a payment of -300 on the
-- day the correction was made. Every reader already sums the column
-- (`stats.service.ts`, `balance.service.ts`), so a negative row nets out
-- everywhere without a single query changing: the patient's balance goes back
-- up and the day's takings go down, which is what actually happened.
--
-- Zero is still refused. A row that moved no money is not a correction, it is a
-- mistake.

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive";
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonzero" CHECK ("amount" <> 0);

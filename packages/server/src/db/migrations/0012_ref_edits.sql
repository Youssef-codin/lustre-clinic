-- Hand-written, like 0006, 0008 and 0011. No snapshot is emitted for it; the
-- next interactive `bun db:generate` brings `meta/` back in line.
--
-- A ref is written at the top of a paper file and read back off it for years,
-- so a wrong one is corrected rather than lived with — and a correction to the
-- number a record is known by is exactly the kind of change somebody comes back
-- asking about months later. This table is that answer: what it was, what it
-- became, the role that declared the change, and when.
--
-- `entity_id` has no foreign key on purpose. An audit trail that disappears
-- with the row it describes is not an audit trail, and a ref moved onto the
-- wrong patient who is then deleted is the sequence most worth being able to
-- read back. Pairing it with `entity` is what lets appointment refs (§5) land
-- here too without a second table.
--
-- `IF NOT EXISTS` throughout: the entrypoint migrates on every start (§4).

CREATE TABLE IF NOT EXISTS "ref_edits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"previous_ref" text NOT NULL,
	"new_ref" text NOT NULL,
	"edited_by" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ref_edits_entity_idx" ON "ref_edits" USING btree ("entity","entity_id","edited_at");

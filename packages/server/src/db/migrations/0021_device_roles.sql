-- Hand-written, like 0012. Role grants and the phones that redeemed them, and
-- the switch that makes a phone without one unwelcome. Off by default: the
-- phones installed before roles existed keep working until an admin turns it on.
--
-- `IF NOT EXISTS` throughout: the entrypoint migrates on every start (§4).

CREATE TABLE IF NOT EXISTS "role_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"code_hash" text NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "role_grants_code_hash_unique" UNIQUE("code_hash")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_grant_id_unique" UNIQUE("grant_id"),
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "devices_grant_id_role_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "role_grants"("id")
);--> statement-breakpoint

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "require_provisioning" boolean NOT NULL DEFAULT false;

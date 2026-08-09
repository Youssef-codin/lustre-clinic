CREATE TABLE "clinic_days" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "clinic_days_weekday_range" CHECK ("clinic_days"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "clinic_days_opens_before_closes" CHECK ("clinic_days"."opens_at" < "clinic_days"."closes_at")
);
--> statement-breakpoint
ALTER TABLE "clinic_days" ADD CONSTRAINT "clinic_days_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
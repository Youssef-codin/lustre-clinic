CREATE TABLE "appointment_procedures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appointment_id" uuid NOT NULL,
	"procedure_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"tooth" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "appointment_procedures_quantity_positive" CHECK ("appointment_procedures"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"patient_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"note" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"channel" text DEFAULT 'desk' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_ref_unique" UNIQUE("ref"),
	CONSTRAINT "appointments_duration_positive" CHECK ("appointments"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_days" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "clinic_days_weekday_range" CHECK ("clinic_days"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "clinic_days_opens_before_closes" CHECK ("clinic_days"."opens_at" < "clinic_days"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "custom_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "custom_questions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"birth_date" date,
	"gender" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"method_note" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_other_requires_note" CHECK ("payments"."method" <> 'other' OR ("payments"."method_note" IS NOT NULL AND "payments"."method_note" <> ''))
);
--> statement-breakpoint
CREATE TABLE "procedure_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"default_price" integer NOT NULL,
	"has_quantity" boolean DEFAULT false NOT NULL,
	"is_tooth_specific" boolean DEFAULT false NOT NULL,
	"is_checkup" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appointment_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "reminders_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"clinic_name" text NOT NULL,
	"clinic_phone" text,
	"duration_options" integer[] DEFAULT '{10,20,30,45}' NOT NULL,
	"default_duration" integer DEFAULT 30 NOT NULL,
	"reminder_lead_hours" integer DEFAULT 24 NOT NULL,
	"reminder_notify_at" time DEFAULT '19:00' NOT NULL,
	"reminder_repeat_minutes" integer DEFAULT 30 NOT NULL,
	"reminder_dismissed_on" date,
	"reminder_template" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "visit_procedures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"procedure_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"tooth" text,
	"note" text,
	CONSTRAINT "visit_procedures_quantity_positive" CHECK ("visit_procedures"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appointment_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"priced_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"computed_total" integer DEFAULT 0 NOT NULL,
	"charged_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
ALTER TABLE "appointment_procedures" ADD CONSTRAINT "appointment_procedures_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_procedures" ADD CONSTRAINT "appointment_procedures_procedure_id_procedure_types_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedure_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_days" ADD CONSTRAINT "clinic_days_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_types" ADD CONSTRAINT "procedure_types_parent_id_procedure_types_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."procedure_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_procedures" ADD CONSTRAINT "visit_procedures_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_procedures" ADD CONSTRAINT "visit_procedures_procedure_id_procedure_types_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedure_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_procedures_appointment_id_idx" ON "appointment_procedures" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_id_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patients_phone_idx" ON "patients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING gin (to_tsvector('simple', "name"));--> statement-breakpoint
CREATE INDEX "payments_visit_id_idx" ON "payments" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "reminders_status_due_at_idx" ON "reminders" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "visit_procedures_visit_id_idx" ON "visit_procedures" USING btree ("visit_id");
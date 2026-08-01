CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`patient_id` integer NOT NULL,
	`starts_at` text NOT NULL,
	`duration_min` integer NOT NULL,
	`type_id` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'booked' NOT NULL,
	`channel` text DEFAULT 'desk' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_ref_unique` ON `appointments` (`ref`);--> statement-breakpoint
CREATE INDEX `idx_appt_starts` ON `appointments` (`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_appt_patient` ON `appointments` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_patients_phone` ON `patients` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_patients_name` ON `patients` (`name`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appointment_id` integer NOT NULL,
	`status` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`sent_at` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rem_appointment` ON `reminders` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_rem_status` ON `reminders` (`status`,`scheduled_for`);
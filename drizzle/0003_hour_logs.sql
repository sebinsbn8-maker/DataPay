CREATE TABLE "contributor_hour_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"device_name" varchar(120) NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributor_hour_logs" ADD CONSTRAINT "contributor_hour_logs_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_hour_logs" ADD CONSTRAINT "contributor_hour_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chl_contributor_date_idx" ON "contributor_hour_logs" USING btree ("contributor_id","work_date");--> statement-breakpoint
CREATE INDEX "chl_date_idx" ON "contributor_hour_logs" USING btree ("work_date");
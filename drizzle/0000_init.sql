CREATE TYPE "public"."acceptance_source" AS ENUM('INDIVIDUAL', 'INDUSTRY_ALLOCATION');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."qc_status" AS ENUM('PENDING', 'PARTIALLY_ACCEPTED', 'FULLY_ACCEPTED', 'REJECTED', 'RESUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."rate_scope" AS ENUM('PROJECT', 'INDUSTRY', 'CONTRIBUTOR');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('NOT_READY', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'VOID');--> statement-breakpoint
CREATE TABLE "acceptance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_record_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"submission_date" date NOT NULL,
	"submitted_hours" numeric(14, 6) NOT NULL,
	"acceptance_pct" numeric(7, 4),
	"accepted_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"rejected_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"qc_status" "qc_status" DEFAULT 'PENDING' NOT NULL,
	"qc_reference" text,
	"source" "acceptance_source" DEFAULT 'INDIVIDUAL' NOT NULL,
	"allocation_method" text,
	"statement_id" uuid,
	"applied_rate" numeric(14, 2),
	"payable_amount" numeric(18, 6),
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(40) NOT NULL,
	"entity" varchar(60) NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"full_name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"joining_date" date,
	"status" "entity_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributors_code_unique" UNIQUE("code"),
	CONSTRAINT "contributors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_work_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"contributor_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"target_hours" numeric(14, 6) NOT NULL,
	"actual_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"submitted_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"remarks" text,
	"recorded_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"manager_id" uuid,
	"status" "entity_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_payment_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"project_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_submitted_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"total_accepted_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"total_rejected_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"total_pending_hours" numeric(14, 6) DEFAULT '0' NOT NULL,
	"calculated_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"adjustments_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"approved_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "statement_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remarks" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "industry_payment_statements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "rate_scope" NOT NULL,
	"project_id" uuid,
	"industry_id" uuid,
	"assignment_id" uuid,
	"hourly_rate" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"reference_number" varchar(100) NOT NULL,
	"method" varchar(30) NOT NULL,
	"remarks" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contributor_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"daily_target_hours" numeric(14, 6) DEFAULT '8' NOT NULL,
	"weekly_target_hours" numeric(14, 6) DEFAULT '40' NOT NULL,
	"monthly_target_hours" numeric(14, 6) DEFAULT '160' NOT NULL,
	"status" "entity_status" DEFAULT 'ACTIVE' NOT NULL,
	"assigned_from" date,
	"assigned_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"client_name" text NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"status" "project_status" DEFAULT 'ACTIVE' NOT NULL,
	"manager_id" uuid,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(20) NOT NULL,
	"description" text,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"google_id" varchar(100),
	"role_id" uuid NOT NULL,
	"contributor_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"reset_token" text,
	"reset_token_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "work_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_record_id" uuid NOT NULL,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"hours" numeric(14, 6) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_daily_record_id_daily_work_records_id_fk" FOREIGN KEY ("daily_record_id") REFERENCES "public"."daily_work_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_records" ADD CONSTRAINT "daily_work_records_assignment_id_project_contributors_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."project_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_records" ADD CONSTRAINT "daily_work_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_records" ADD CONSTRAINT "daily_work_records_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_records" ADD CONSTRAINT "daily_work_records_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_records" ADD CONSTRAINT "daily_work_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_payment_statements" ADD CONSTRAINT "industry_payment_statements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_payment_statements" ADD CONSTRAINT "industry_payment_statements_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_payment_statements" ADD CONSTRAINT "industry_payment_statements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_payment_statements" ADD CONSTRAINT "industry_payment_statements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_statement_id_industry_payment_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."industry_payment_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rates" ADD CONSTRAINT "payment_rates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rates" ADD CONSTRAINT "payment_rates_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rates" ADD CONSTRAINT "payment_rates_assignment_id_project_contributors_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."project_contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rates" ADD CONSTRAINT "payment_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_statement_id_industry_payment_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."industry_payment_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contributors" ADD CONSTRAINT "project_contributors_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contributors" ADD CONSTRAINT "project_contributors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contributors" ADD CONSTRAINT "project_contributors_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_daily_record_id_daily_work_records_id_fk" FOREIGN KEY ("daily_record_id") REFERENCES "public"."daily_work_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acc_daily_uq" ON "acceptance_records" USING btree ("daily_record_id");--> statement-breakpoint
CREATE INDEX "acc_industry_date_idx" ON "acceptance_records" USING btree ("industry_id","submission_date");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dwr_assignment_date_uq" ON "daily_work_records" USING btree ("assignment_id","work_date");--> statement-breakpoint
CREATE INDEX "dwr_date_idx" ON "daily_work_records" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "dwr_industry_idx" ON "daily_work_records" USING btree ("industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "industries_project_name_uq" ON "industries" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "stmt_industry_idx" ON "industry_payment_statements" USING btree ("industry_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "rates_lookup_idx" ON "payment_rates" USING btree ("scope","project_id","industry_id","assignment_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "txn_ref_uq" ON "payment_transactions" USING btree ("statement_id","reference_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pc_unique_active" ON "project_contributors" USING btree ("contributor_id","project_id","industry_id");--> statement-breakpoint
CREATE INDEX "pc_industry_idx" ON "project_contributors" USING btree ("industry_id");
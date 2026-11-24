CREATE TABLE "contributor_signatures" (
	"contributor_id" uuid PRIMARY KEY NOT NULL,
	"mime" varchar(20) NOT NULL,
	"data" text NOT NULL,
	"bytes" integer NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributor_signatures" ADD CONSTRAINT "contributor_signatures_contributor_id_contributors_id_fk" FOREIGN KEY ("contributor_id") REFERENCES "public"."contributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_signatures" ADD CONSTRAINT "contributor_signatures_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
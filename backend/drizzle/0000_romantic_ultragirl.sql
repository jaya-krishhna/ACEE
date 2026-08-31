-- Enable pgvector extension (must run before any table with a vector column)
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "organization_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"org_type" text NOT NULL,
	"contact_name" text,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"website_url" text,
	"logo_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"is_banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizer_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "eligibility_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "eligibility_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "eligibility_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"state" text,
	"country" text DEFAULT 'India' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "locations_city_state_country_unique" UNIQUE("city","state","country")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"field_type" text NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false,
	"sort_order" smallint DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "event_eligibility" (
	"event_id" uuid NOT NULL,
	"eligibility_category_id" integer NOT NULL,
	CONSTRAINT "event_eligibility_event_id_eligibility_category_id_pk" PRIMARY KEY("event_id","eligibility_category_id")
);
--> statement-breakpoint
CREATE TABLE "event_tags" (
	"event_id" uuid NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "event_tags_event_id_tag_id_pk" PRIMARY KEY("event_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by" uuid,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text,
	"description" text NOT NULL,
	"thumbnail_image_url" text,
	"banner_image_url" text,
	"document_url" text,
	"external_registration_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"flagged_reason" text,
	"mode" text NOT NULL,
	"venue" text,
	"location_id" integer,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"registration_fee" numeric(10, 2) DEFAULT '0',
	"currency" text DEFAULT 'INR' NOT NULL,
	"fee_confidence" text DEFAULT 'explicit',
	"resume_required" boolean DEFAULT false NOT NULL,
	"registration_open_at" timestamp with time zone,
	"registration_close_at" timestamp with time zone,
	"event_start_at" timestamp with time zone NOT NULL,
	"event_end_at" timestamp with time zone,
	"eligibility_notes" text,
	"eligibility_confidence" text DEFAULT 'explicit',
	"registration_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"embedding_source_text" text,
	"embedding_updated_at" timestamp with time zone,
	"search_text_tsv" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "hackathon_details" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"max_participants" integer,
	"prize_summary_text" text,
	"tracks" text[],
	"submission_type" text
);
--> statement-breakpoint
CREATE TABLE "internship_details" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"stipend_min" numeric(10, 2),
	"stipend_max" numeric(10, 2),
	"duration_months" numeric(4, 1),
	"work_mode" text,
	"positions_available" integer,
	"min_experience_months" integer DEFAULT 0,
	"perks" text[]
);
--> statement-breakpoint
CREATE TABLE "workshop_details" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"speaker_name" text,
	"speaker_bio" text,
	"duration_hours" numeric(4, 1),
	"seats_available" integer,
	"certificate_provided" boolean DEFAULT false,
	"prerequisite_skills" text[]
);
--> statement-breakpoint
CREATE TABLE "event_registration_responses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"registration_id" uuid NOT NULL,
	"field_id" integer NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"payment_status" text DEFAULT 'not_applicable' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_registrations_event_id_user_id_unique" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "saved_events" (
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_events_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"auth_provider" text DEFAULT 'email' NOT NULL,
	"phone" text,
	"resume_url" text,
	"college_name" text,
	"branch" text,
	"year_of_study" smallint,
	"city_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "search_query_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"raw_query" text NOT NULL,
	"extracted_filters" jsonb,
	"filters_relaxed" jsonb,
	"results_count" integer,
	"clicked_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_organizer_accounts_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."organizer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_accounts" ADD CONSTRAINT "organizer_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_custom_fields" ADD CONSTRAINT "event_custom_fields_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_eligibility" ADD CONSTRAINT "event_eligibility_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_eligibility" ADD CONSTRAINT "event_eligibility_eligibility_category_id_eligibility_categories_id_fk" FOREIGN KEY ("eligibility_category_id") REFERENCES "public"."eligibility_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_organizer_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."organizer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_details" ADD CONSTRAINT "hackathon_details_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_details" ADD CONSTRAINT "internship_details_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_details" ADD CONSTRAINT "workshop_details_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_responses" ADD CONSTRAINT "event_registration_responses_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registration_responses" ADD CONSTRAINT "event_registration_responses_field_id_event_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."event_custom_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_city_id_locations_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_query_log" ADD CONSTRAINT "search_query_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_query_log" ADD CONSTRAINT "search_query_log_clicked_event_id_events_id_fk" FOREIGN KEY ("clicked_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_invitations_email" ON "organization_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_event_eligibility_category" ON "event_eligibility" USING btree ("eligibility_category_id");--> statement-breakpoint
CREATE INDEX "idx_event_tags_tag" ON "event_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_events_status_type" ON "events" USING btree ("status","event_type");--> statement-breakpoint
CREATE INDEX "idx_events_location" ON "events" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_events_dates" ON "events" USING btree ("event_start_at","registration_close_at");--> statement-breakpoint
CREATE INDEX "idx_events_embedding" ON "events" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_events_search_tsv" ON "events" USING gin ("search_text_tsv");--> statement-breakpoint
CREATE INDEX "idx_event_registrations_event" ON "event_registrations" USING btree ("event_id");
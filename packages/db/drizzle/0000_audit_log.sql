CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_identity_id" text,
	"actor_email" text,
	"actor_name" text,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"resource_label" text,
	"verb" text NOT NULL,
	"organization" text,
	"status" text DEFAULT 'success' NOT NULL,
	"application_id" text,
	"application_name" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb,
	"ip" "inet",
	"user_agent" text,
	"request_id" text,
	"session_id" text
);
--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "audit_log" USING btree ("resource","resource_id","created_at" DESC NULLS LAST) WHERE "audit_log"."resource_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_verb" ON "audit_log" USING btree ("verb","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_identity_id","created_at" DESC NULLS LAST) WHERE "audit_log"."actor_identity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_organization" ON "audit_log" USING btree ("organization","created_at" DESC NULLS LAST) WHERE "audit_log"."organization" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_session" ON "audit_log" USING btree ("session_id","created_at" DESC NULLS LAST) WHERE "audit_log"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_application" ON "audit_log" USING btree ("application_id","created_at" DESC NULLS LAST) WHERE "audit_log"."application_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_audit_context" ON "audit_log" USING gin ("context");
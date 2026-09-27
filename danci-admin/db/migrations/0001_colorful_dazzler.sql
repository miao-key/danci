CREATE TYPE "public"."admin_status" AS ENUM('active', 'disabled');--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "status" "admin_status" DEFAULT 'active' NOT NULL;
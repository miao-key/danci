CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"wordCount" integer DEFAULT 0,
	"coverUrl" text,
	"bookId" text NOT NULL,
	"tags" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_bookId_unique" UNIQUE("bookId")
);
--> statement-breakpoint
CREATE INDEX "books_book_id_idx" ON "books" USING btree ("bookId");
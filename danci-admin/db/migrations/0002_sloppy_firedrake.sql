CREATE TABLE "words" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wordRank" integer,
	"headWord" text,
	"content" json,
	"bookId" text
);

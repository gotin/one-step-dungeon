CREATE TABLE "game_saves" (
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"data" jsonb,
	"active_token" text NOT NULL,
	"saved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_saves_user_id_game_pk" PRIMARY KEY("user_id","game")
);
--> statement-breakpoint
ALTER TABLE "game_saves" ADD CONSTRAINT "game_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
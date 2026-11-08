CREATE SCHEMA IF NOT EXISTS desktop;
CREATE TABLE IF NOT EXISTS desktop.screens (id text PRIMARY KEY,user_id text NOT NULL,bot_id text UNIQUE NOT NULL,desktop_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

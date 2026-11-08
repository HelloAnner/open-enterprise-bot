CREATE SCHEMA IF NOT EXISTS gateway;
CREATE TABLE IF NOT EXISTS gateway.users(id text PRIMARY KEY,username text UNIQUE NOT NULL,name text NOT NULL,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS gateway.auth_attempts(id text PRIMARY KEY,count integer NOT NULL,until_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS gateway.bots (
 id text PRIMARY KEY, user_id text NOT NULL, data jsonb NOT NULL, deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bots_user ON gateway.bots(user_id);
CREATE TABLE IF NOT EXISTS gateway.threads (
 id text PRIMARY KEY, user_id text NOT NULL, bot_id text NOT NULL REFERENCES gateway.bots(id), channel text NOT NULL, conversation text NOT NULL,
 UNIQUE(user_id,bot_id,channel,conversation)
);
CREATE TABLE IF NOT EXISTS gateway.messages (
 id text PRIMARY KEY, user_id text NOT NULL, bot_id text NOT NULL REFERENCES gateway.bots(id), thread_id text NOT NULL REFERENCES gateway.threads(id), data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation ON gateway.messages(user_id,bot_id,created_at,id);
-- ponytail: small attachments in PG (10 MiB default); replace bytes with object-store references for large files.
CREATE TABLE IF NOT EXISTS gateway.files (id text PRIMARY KEY,user_id text NOT NULL,bot_id text NOT NULL,name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL);
CREATE TABLE IF NOT EXISTS gateway.boards (user_id text PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS gateway.receipts (event_id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gateway.outbox (id text PRIMARY KEY,subject text NOT NULL,event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz);
CREATE TABLE IF NOT EXISTS gateway.security_forms (id text PRIMARY KEY,user_id text NOT NULL,bot_id text NOT NULL,ticket_id text NOT NULL,scope text NOT NULL,status text NOT NULL DEFAULT 'pending',expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS gateway.vault (id text PRIMARY KEY,user_id text NOT NULL,bot_id text NOT NULL,ticket_id text NOT NULL,scope text NOT NULL,ciphertext bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

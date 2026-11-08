CREATE SCHEMA IF NOT EXISTS runtime;
CREATE TABLE IF NOT EXISTS runtime.sessions (id text PRIMARY KEY,user_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('main','work','worker')),bot_id text,checkpoint jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS runtime.pi_turns (session_id text NOT NULL,event_id text NOT NULL,bot_id text NOT NULL,transcript jsonb NOT NULL,PRIMARY KEY(session_id,event_id));
CREATE TABLE IF NOT EXISTS runtime.turns (session_id text NOT NULL,event_id text NOT NULL,bot_id text NOT NULL,decision jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(session_id,event_id));
CREATE TABLE IF NOT EXISTS runtime.tickets (id text PRIMARY KEY,user_id text NOT NULL,bot_id text NOT NULL,thread_id text NOT NULL,router_id text NOT NULL,goal text NOT NULL,plan jsonb NOT NULL,workdir text NOT NULL,state text NOT NULL DEFAULT 'working',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS runtime.workers (id text PRIMARY KEY,user_id text NOT NULL,ticket_id text NOT NULL REFERENCES runtime.tickets(id),workdir text NOT NULL,plan jsonb NOT NULL,current_job_id text,pending_plan jsonb,state text NOT NULL DEFAULT 'working');
CREATE TABLE IF NOT EXISTS runtime.memory (user_id text NOT NULL,bot_id text NOT NULL,key text NOT NULL,value text NOT NULL,PRIMARY KEY(user_id,bot_id,key));
CREATE TABLE IF NOT EXISTS runtime.outbox (id text PRIMARY KEY,subject text NOT NULL,event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz);

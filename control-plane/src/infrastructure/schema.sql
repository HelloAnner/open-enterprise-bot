CREATE SCHEMA IF NOT EXISTS control;
CREATE TABLE IF NOT EXISTS control.events (id text PRIMARY KEY,user_id text NOT NULL,event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS control.audit (id bigserial PRIMARY KEY,user_id text NOT NULL,event_id text NOT NULL,decision text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS control.leases (session_id text PRIMARY KEY,user_id text NOT NULL,owner text NOT NULL,epoch bigint NOT NULL DEFAULT 1,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS control.deliveries (id text PRIMARY KEY,session_id text NOT NULL,user_id text NOT NULL,event jsonb NOT NULL,state text NOT NULL DEFAULT 'pending',owner text,claimed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS delivery_pending ON control.deliveries(state,created_at);
CREATE TABLE IF NOT EXISTS control.subscriptions (thread_id text NOT NULL,ticket_id text NOT NULL,user_id text NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(thread_id,ticket_id));
CREATE TABLE IF NOT EXISTS control.jobs (
 id text PRIMARY KEY,operation_id text UNIQUE NOT NULL,user_id text NOT NULL,bot_id text NOT NULL,thread_id text NOT NULL,ticket_id text NOT NULL,worker_id text NOT NULL,desktop_id text NOT NULL,
 vm_epoch bigint NOT NULL,tool text NOT NULL,input jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',desired text NOT NULL DEFAULT 'running',result jsonb NOT NULL DEFAULT '{}',claim_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS control.artifacts (id text PRIMARY KEY,user_id text NOT NULL,bot_id text NOT NULL,ticket_id text NOT NULL,worker_id text NOT NULL,job_id text NOT NULL,name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS control.desktops (id text PRIMARY KEY,user_id text UNIQUE NOT NULL,volume_id text UNIQUE NOT NULL,node_url text NOT NULL,epoch bigint NOT NULL DEFAULT 1,desired text NOT NULL DEFAULT 'running',state text NOT NULL DEFAULT 'starting',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS control.outbox (id text PRIMARY KEY,subject text NOT NULL,event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz);
-- Runtime may fence a checkpoint without acquiring UPDATE permission on the lease table.
CREATE OR REPLACE FUNCTION control.assert_lease(s text,o text,e bigint,u text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,control AS $$
BEGIN
  PERFORM 1 FROM control.leases WHERE session_id=s AND owner=o AND epoch=e AND user_id=u AND expires_at>now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session lease lost' USING ERRCODE='P0001'; END IF;
END $$;
REVOKE ALL ON FUNCTION control.assert_lease(text,text,bigint,text) FROM PUBLIC;

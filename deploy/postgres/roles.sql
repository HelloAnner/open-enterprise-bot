-- Migration runs as the PostgreSQL administrator; apps never receive these credentials.
\getenv api_password API_DB_PASSWORD
\getenv control_password CONTROL_DB_PASSWORD
\getenv runtime_password RUNTIME_DB_PASSWORD
\getenv desktop_password DESKTOP_DB_PASSWORD
SELECT 'CREATE ROLE eob_' || name || ' LOGIN' FROM (VALUES ('api'),('control'),('runtime'),('desktop')) v(name) WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='eob_'||name) \gexec
ALTER ROLE eob_api PASSWORD :'api_password';
ALTER ROLE eob_control PASSWORD :'control_password';
ALTER ROLE eob_runtime PASSWORD :'runtime_password';
ALTER ROLE eob_desktop PASSWORD :'desktop_password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA gateway TO eob_api,eob_control;
GRANT ALL ON ALL TABLES IN SCHEMA gateway TO eob_api;
GRANT ALL ON ALL SEQUENCES IN SCHEMA gateway TO eob_api;
GRANT SELECT ON gateway.bots,gateway.threads TO eob_control;
GRANT USAGE ON SCHEMA runtime TO eob_runtime,eob_control,eob_api;
GRANT ALL ON ALL TABLES IN SCHEMA runtime TO eob_runtime;
GRANT SELECT ON runtime.tickets,runtime.workers,runtime.sessions TO eob_control;
GRANT SELECT ON runtime.tickets TO eob_api;
GRANT USAGE ON SCHEMA control TO eob_control,eob_runtime,eob_api,eob_desktop;
GRANT ALL ON ALL TABLES IN SCHEMA control TO eob_control;
GRANT ALL ON ALL SEQUENCES IN SCHEMA control TO eob_control;
GRANT SELECT ON control.jobs TO eob_api;
GRANT SELECT ON control.jobs,control.desktops TO eob_desktop;
GRANT USAGE ON SCHEMA gateway TO eob_desktop;
GRANT SELECT ON gateway.bots TO eob_desktop;
GRANT USAGE ON SCHEMA desktop TO eob_desktop;
GRANT ALL ON ALL TABLES IN SCHEMA desktop TO eob_desktop;
GRANT EXECUTE ON FUNCTION control.assert_lease(text,text,bigint,text) TO eob_runtime;

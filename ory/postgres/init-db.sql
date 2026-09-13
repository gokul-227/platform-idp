-- Runs once on first container start (after `docker compose down -v`).
-- POSTGRES_DB auto-creates `kratos`; the rest need their own. Created here for
-- the same reason infra creates them there: a runtime identity should not hold
-- the privilege to create a database.

SELECT 'CREATE DATABASE hydra OWNER id_app_role'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'hydra')\gexec

SELECT 'CREATE DATABASE keto OWNER id_app_role'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keto')\gexec

SELECT 'CREATE DATABASE identity OWNER id_app_role'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'identity')\gexec

-- Runs once, when the data volume is first initialised.
SELECT 'CREATE DATABASE marketplace_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'marketplace_test')\gexec

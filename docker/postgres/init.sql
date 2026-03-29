-- PostgreSQL initialization script for Enterprise Web Crawler
-- This script runs when the PostgreSQL container starts for the first time

-- Create additional databases if needed
CREATE DATABASE webcrawler_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE webcrawler TO webcrawler;
GRANT ALL PRIVILEGES ON DATABASE webcrawler_test TO webcrawler;

-- Create extensions
\c webcrawler;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\c webcrawler_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Switch back to main database
\c webcrawler;

-- Create initial schema (this will be managed by migrations in production)
-- This is just for development convenience

-- Log the initialization
INSERT INTO pg_stat_statements_info (dealloc) VALUES (0) ON CONFLICT DO NOTHING;

-- Set up logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- Reload configuration
SELECT pg_reload_conf();
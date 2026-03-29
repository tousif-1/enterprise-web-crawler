-- Migration: 001_initial_schema
-- Description: Create initial database schema for enterprise web crawler
-- Created: 2024-01-01

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and session management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crawl sessions table
CREATE TABLE crawl_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    config JSONB NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    total_urls INTEGER DEFAULT 0,
    processed_urls INTEGER DEFAULT 0,
    failed_urls INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crawl results table
CREATE TABLE crawl_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
    http_status INTEGER,
    response_time INTEGER, -- in milliseconds
    content_hash VARCHAR(32), -- MD5 hash
    last_modified TIMESTAMP WITH TIME ZONE,
    accessibility_score DECIMAL(5,2), -- 0.00 to 100.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Issues table for storing detected problems
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crawl_result_id UUID NOT NULL REFERENCES crawl_results(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('broken_link', 'missing_image', 'accessibility', 'performance')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    element TEXT,
    wcag_guideline VARCHAR(50),
    remediation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Links table for link inventory and validation
CREATE TABLE links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crawl_result_id UUID NOT NULL REFERENCES crawl_results(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    text TEXT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('internal', 'external')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'valid', 'broken', 'redirect')),
    http_status INTEGER,
    redirect_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reports table for generated report metadata
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('pdf', 'csv', 'json')),
    file_path TEXT,
    file_size BIGINT,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance optimization
CREATE INDEX idx_crawl_sessions_user_id ON crawl_sessions(user_id);
CREATE INDEX idx_crawl_sessions_status ON crawl_sessions(status);
CREATE INDEX idx_crawl_sessions_created_at ON crawl_sessions(created_at DESC);

CREATE INDEX idx_crawl_results_session_id ON crawl_results(session_id);
CREATE INDEX idx_crawl_results_url ON crawl_results(url);
CREATE INDEX idx_crawl_results_status ON crawl_results(status);
CREATE INDEX idx_crawl_results_http_status ON crawl_results(http_status);
CREATE INDEX idx_crawl_results_content_hash ON crawl_results(content_hash);
CREATE INDEX idx_crawl_results_created_at ON crawl_results(created_at DESC);

CREATE INDEX idx_issues_crawl_result_id ON issues(crawl_result_id);
CREATE INDEX idx_issues_type ON issues(type);
CREATE INDEX idx_issues_severity ON issues(severity);
CREATE INDEX idx_issues_wcag_guideline ON issues(wcag_guideline);

CREATE INDEX idx_links_crawl_result_id ON links(crawl_result_id);
CREATE INDEX idx_links_url ON links(url);
CREATE INDEX idx_links_source_url ON links(source_url);
CREATE INDEX idx_links_type ON links(type);
CREATE INDEX idx_links_status ON links(status);
CREATE INDEX idx_links_http_status ON links(http_status);

CREATE INDEX idx_reports_session_id ON reports(session_id);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_generated_at ON reports(generated_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_crawl_results_session_status ON crawl_results(session_id, status);
CREATE INDEX idx_issues_result_type_severity ON issues(crawl_result_id, type, severity);
CREATE INDEX idx_links_result_status ON links(crawl_result_id, status);

-- Full-text search indexes
CREATE INDEX idx_issues_description_fts ON issues USING gin(to_tsvector('english', description));
CREATE INDEX idx_links_text_fts ON links USING gin(to_tsvector('english', text));

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crawl_sessions_updated_at BEFORE UPDATE ON crawl_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
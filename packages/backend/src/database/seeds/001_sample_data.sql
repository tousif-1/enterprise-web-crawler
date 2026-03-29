-- Sample data for development and testing
-- This file contains sample data to help with development and testing

-- Insert sample users
INSERT INTO users (id, email, name) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'admin@example.com', 'Admin User'),
  ('550e8400-e29b-41d4-a716-446655440002', 'analyst@example.com', 'Marketing Analyst'),
  ('550e8400-e29b-41d4-a716-446655440003', 'manager@example.com', 'Marketing Manager')
ON CONFLICT (email) DO NOTHING;

-- Insert sample crawl session
INSERT INTO crawl_sessions (
  id, user_id, name, status, config, start_time, 
  total_urls, processed_urls, failed_urls
) VALUES (
  '550e8400-e29b-41d4-a716-446655440010',
  '550e8400-e29b-41d4-a716-446655440001',
  'Sample Website Crawl',
  'completed',
  '{"urls": ["https://example.com"], "excludePaths": ["/admin", "/api"], "maxDepth": 3, "concurrency": 5, "respectRobots": true}',
  CURRENT_TIMESTAMP - INTERVAL '1 hour',
  25,
  23,
  2
) ON CONFLICT (id) DO NOTHING;

-- Insert sample crawl results
INSERT INTO crawl_results (
  id, session_id, url, status, http_status, response_time,
  content_hash, last_modified, accessibility_score
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440020',
    '550e8400-e29b-41d4-a716-446655440010',
    'https://example.com',
    'success',
    200,
    1250,
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    CURRENT_TIMESTAMP - INTERVAL '45 minutes',
    85.5
  ),
  (
    '550e8400-e29b-41d4-a716-446655440021',
    '550e8400-e29b-41d4-a716-446655440010',
    'https://example.com/about',
    'success',
    200,
    980,
    'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7',
    CURRENT_TIMESTAMP - INTERVAL '40 minutes',
    92.3
  ),
  (
    '550e8400-e29b-41d4-a716-446655440022',
    '550e8400-e29b-41d4-a716-446655440010',
    'https://example.com/contact',
    'failed',
    404,
    2100,
    NULL,
    NULL,
    0.0
  )
ON CONFLICT (id) DO NOTHING;

-- Insert sample issues
INSERT INTO issues (
  id, crawl_result_id, type, severity, description,
  element, wcag_guideline, remediation
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440020',
    'accessibility',
    'medium',
    'Image missing alt text',
    '<img src="/logo.png">',
    '1.1.1',
    'Add descriptive alt text to the image element'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440031',
    '550e8400-e29b-41d4-a716-446655440020',
    'accessibility',
    'high',
    'Insufficient color contrast ratio',
    '.btn-primary',
    '1.4.3',
    'Increase contrast ratio to at least 4.5:1 for normal text'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440032',
    '550e8400-e29b-41d4-a716-446655440021',
    'broken_link',
    'critical',
    'Link returns 404 Not Found',
    '<a href="/old-page">',
    NULL,
    'Update link to point to correct URL or remove if no longer needed'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440033',
    '550e8400-e29b-41d4-a716-446655440022',
    'missing_image',
    'high',
    'Image resource not found',
    '<img src="/missing-image.jpg">',
    NULL,
    'Upload missing image or update src attribute to correct path'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert sample links
INSERT INTO links (
  id, crawl_result_id, url, source_url, text, type, status, http_status
) VALUES
  (
    '550e8400-e29b-41d4-a716-446655440040',
    '550e8400-e29b-41d4-a716-446655440020',
    'https://example.com/about',
    'https://example.com',
    'About Us',
    'internal',
    'valid',
    200
  ),
  (
    '550e8400-e29b-41d4-a716-446655440041',
    '550e8400-e29b-41d4-a716-446655440020',
    'https://example.com/contact',
    'https://example.com',
    'Contact',
    'internal',
    'broken',
    404
  ),
  (
    '550e8400-e29b-41d4-a716-446655440042',
    '550e8400-e29b-41d4-a716-446655440020',
    'https://google.com',
    'https://example.com',
    'Google',
    'external',
    'valid',
    200
  ),
  (
    '550e8400-e29b-41d4-a716-446655440043',
    '550e8400-e29b-41d4-a716-446655440021',
    'https://example.com/old-page',
    'https://example.com/about',
    'Old Page',
    'internal',
    'broken',
    404
  )
ON CONFLICT (id) DO NOTHING;

-- Insert sample report
INSERT INTO reports (
  id, session_id, type, file_path, file_size
) VALUES (
  '550e8400-e29b-41d4-a716-446655440050',
  '550e8400-e29b-41d4-a716-446655440010',
  'pdf',
  '/reports/sample-crawl-report.pdf',
  1024000
) ON CONFLICT (id) DO NOTHING;
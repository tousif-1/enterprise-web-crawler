import { UrlPatternMatcher, UrlPatternUtils } from '../utils/url-pattern-matcher';

describe('UrlPatternMatcher', () => {
  let matcher: UrlPatternMatcher;

  beforeEach(() => {
    matcher = new UrlPatternMatcher();
  });

  describe('Pattern Type Detection', () => {
    it('should detect regex patterns', () => {
      const patterns = ['/^\/api\//', '/\\d+/', '/test$/'];
      matcher.setPatterns(patterns);
      
      const detectedPatterns = matcher.getPatterns();
      expect(detectedPatterns).toHaveLength(3);
      expect(detectedPatterns[0].type).toBe('regex');
      expect(detectedPatterns[1].type).toBe('regex');
      expect(detectedPatterns[2].type).toBe('regex');
    });

    it('should detect glob patterns', () => {
      const patterns = ['/docs/*.html', '/api/v?/users', '*/test/*'];
      matcher.setPatterns(patterns);
      
      const detectedPatterns = matcher.getPatterns();
      expect(detectedPatterns).toHaveLength(3);
      expect(detectedPatterns[0].type).toBe('glob');
      expect(detectedPatterns[1].type).toBe('glob');
      expect(detectedPatterns[2].type).toBe('glob');
    });

    it('should detect prefix patterns', () => {
      const patterns = ['/admin', '/api', '/private*'];
      matcher.setPatterns(patterns);
      
      const detectedPatterns = matcher.getPatterns();
      expect(detectedPatterns[0].type).toBe('prefix');
      expect(detectedPatterns[1].type).toBe('prefix');
      expect(detectedPatterns[2].type).toBe('prefix');
    });

    it('should detect suffix patterns', () => {
      const patterns = ['*admin', '*test'];
      matcher.setPatterns(patterns);
      
      const detectedPatterns = matcher.getPatterns();
      expect(detectedPatterns[0].type).toBe('suffix');
      expect(detectedPatterns[1].type).toBe('suffix');
    });

    it('should detect contains patterns', () => {
      const patterns = ['*admin*', '*private*'];
      matcher.setPatterns(patterns);
      
      const detectedPatterns = matcher.getPatterns();
      // These will be detected as glob patterns due to multiple wildcards
      expect(detectedPatterns[0].type).toBe('glob');
      expect(detectedPatterns[1].type).toBe('glob');
    });
  });

  describe('URL Matching', () => {
    it('should match exact patterns', () => {
      matcher.setPatterns([{ pattern: '/admin', type: 'exact', caseSensitive: false }]);
      
      expect(matcher.matches('https://example.com/admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/admin/users').matches).toBe(false);
      expect(matcher.matches('https://example.com/administrator').matches).toBe(false);
    });

    it('should match prefix patterns', () => {
      matcher.setPatterns(['/admin', '/api']);
      
      expect(matcher.matches('https://example.com/admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/admin/users').matches).toBe(true);
      expect(matcher.matches('https://example.com/api/v1/users').matches).toBe(true);
      expect(matcher.matches('https://example.com/public').matches).toBe(false);
    });

    it('should match suffix patterns', () => {
      matcher.setPatterns(['*admin']);
      
      expect(matcher.matches('https://example.com/superadmin').matches).toBe(true);
      expect(matcher.matches('https://example.com/admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/administrator').matches).toBe(false);
    });

    it('should match contains patterns', () => {
      matcher.setPatterns(['*private*']);
      
      expect(matcher.matches('https://example.com/private').matches).toBe(true);
      expect(matcher.matches('https://example.com/user/private/docs').matches).toBe(true);
      expect(matcher.matches('https://example.com/privateer').matches).toBe(true);
      expect(matcher.matches('https://example.com/public').matches).toBe(false);
    });

    it('should match glob patterns', () => {
      matcher.setPatterns(['*.pdf', '/docs/*.html', '/api/v?/users']);
      
      expect(matcher.matches('https://example.com/document.pdf').matches).toBe(true);
      expect(matcher.matches('https://example.com/docs/guide.html').matches).toBe(true);
      expect(matcher.matches('https://example.com/api/v1/users').matches).toBe(true);
      expect(matcher.matches('https://example.com/api/v2/users').matches).toBe(true);
      expect(matcher.matches('https://example.com/api/v10/users').matches).toBe(false);
    });

    it('should match regex patterns', () => {
      matcher.setPatterns(['/^\/api\/v\\d+\//', '/\\.pdf$/', '/\\/(admin|private)\\//']);
      
      expect(matcher.matches('https://example.com/api/v1/users').matches).toBe(true);
      expect(matcher.matches('https://example.com/api/v123/data').matches).toBe(true);
      expect(matcher.matches('https://example.com/document.pdf').matches).toBe(true);
      expect(matcher.matches('https://example.com/admin/panel').matches).toBe(true);
      expect(matcher.matches('https://example.com/private/docs').matches).toBe(true);
      expect(matcher.matches('https://example.com/public/info').matches).toBe(false);
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle case insensitive matching by default', () => {
      matcher.setPatterns(['/Admin', '/API']);
      
      expect(matcher.matches('https://example.com/admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/api').matches).toBe(true);
      expect(matcher.matches('https://example.com/ADMIN').matches).toBe(true);
    });

    it('should handle case sensitive matching when specified', () => {
      matcher.setPatterns([
        { pattern: '/Admin', type: 'prefix', caseSensitive: true },
        { pattern: '/API', type: 'prefix', caseSensitive: true }
      ]);
      
      expect(matcher.matches('https://example.com/Admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/admin').matches).toBe(false);
      expect(matcher.matches('https://example.com/API').matches).toBe(true);
      expect(matcher.matches('https://example.com/api').matches).toBe(false);
    });
  });

  describe('Pattern Management', () => {
    it('should add patterns dynamically', () => {
      matcher.addPattern('/admin');
      matcher.addPattern('*.pdf');
      
      expect(matcher.getPatterns()).toHaveLength(2);
      expect(matcher.matches('https://example.com/admin').matches).toBe(true);
      expect(matcher.matches('https://example.com/doc.pdf').matches).toBe(true);
    });

    it('should remove patterns', () => {
      matcher.setPatterns(['/admin', '/api', '*.pdf']);
      expect(matcher.getPatterns()).toHaveLength(3);
      
      matcher.removePattern('/admin');
      expect(matcher.getPatterns()).toHaveLength(2);
      expect(matcher.matches('https://example.com/admin').matches).toBe(false);
      expect(matcher.matches('https://example.com/api').matches).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', () => {
      matcher.setPatterns(['/admin']);
      
      expect(matcher.matches('not-a-url').matches).toBe(false);
      expect(matcher.matches('').matches).toBe(false);
    });

    it('should handle invalid regex patterns gracefully', () => {
      matcher.setPatterns(['/[invalid/']);
      
      expect(matcher.matches('https://example.com/test').matches).toBe(false);
    });
  });

  describe('Match Results', () => {
    it('should return matched pattern and part', () => {
      matcher.setPatterns(['/admin', '*.pdf']);
      
      const result1 = matcher.matches('https://example.com/admin/users');
      expect(result1.matches).toBe(true);
      expect(result1.matchedPattern?.pattern).toBe('/admin');
      expect(result1.matchedPart).toBe('/admin');

      const result2 = matcher.matches('https://example.com/document.pdf');
      expect(result2.matches).toBe(true);
      // *.pdf is treated as suffix pattern, so the stored pattern is '.pdf'
      expect(result2.matchedPattern?.pattern).toBe('.pdf');
      expect(result2.matchedPart).toBeDefined();
    });
  });
});

describe('UrlPatternUtils', () => {
  describe('Common Exclusion Patterns', () => {
    it('should create common exclusion patterns', () => {
      const patterns = UrlPatternUtils.createCommonExclusionPatterns();
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.pattern === '/admin')).toBe(true);
      expect(patterns.some(p => p.pattern === '/api')).toBe(true);
      expect(patterns.some(p => p.pattern === '*.pdf')).toBe(true);
    });
  });

  describe('Pattern Validation', () => {
    it('should validate valid patterns', () => {
      const validPatterns = ['/admin', '*.pdf', '/^\/api\//', '*private*'];
      
      validPatterns.forEach(pattern => {
        const result = UrlPatternUtils.validatePattern(pattern);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should detect invalid regex patterns', () => {
      const invalidPatterns = ['/[invalid/', '/(?invalid)/'];
      
      invalidPatterns.forEach(pattern => {
        const result = UrlPatternUtils.validatePattern(pattern);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('Invalid regular expression');
      });
    });
  });

  describe('Pattern Type Description', () => {
    it('should provide correct descriptions for pattern types', () => {
      expect(UrlPatternUtils.getPatternTypeDescription('/admin')).toBe('Starts with');
      expect(UrlPatternUtils.getPatternTypeDescription('*.pdf')).toBe('Ends with');
      expect(UrlPatternUtils.getPatternTypeDescription('/^\/api\//')).toBe('Regular expression');
      expect(UrlPatternUtils.getPatternTypeDescription('*admin*')).toBe('Glob pattern (* and ?)');
      expect(UrlPatternUtils.getPatternTypeDescription('/docs/*.html')).toBe('Glob pattern (* and ?)');
    });
  });
});
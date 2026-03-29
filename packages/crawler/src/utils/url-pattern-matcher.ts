import { URL } from 'url';

export interface UrlPattern {
  pattern: string;
  type: 'exact' | 'prefix' | 'suffix' | 'contains' | 'regex' | 'glob';
  caseSensitive?: boolean;
}

export interface UrlMatchResult {
  matches: boolean;
  matchedPattern?: UrlPattern;
  matchedPart?: string;
}

export class UrlPatternMatcher {
  private patterns: UrlPattern[] = [];

  constructor(patterns: (string | UrlPattern)[] = []) {
    this.setPatterns(patterns);
  }

  /**
   * Set patterns for matching
   */
  setPatterns(patterns: (string | UrlPattern)[]): void {
    this.patterns = patterns.map(pattern => {
      if (typeof pattern === 'string') {
        return this.parseStringPattern(pattern);
      }
      return pattern;
    });
  }

  /**
   * Add a single pattern
   */
  addPattern(pattern: string | UrlPattern): void {
    const urlPattern = typeof pattern === 'string' 
      ? this.parseStringPattern(pattern) 
      : pattern;
    this.patterns.push(urlPattern);
  }

  /**
   * Remove patterns that match the given pattern string
   */
  removePattern(patternString: string): void {
    this.patterns = this.patterns.filter(p => p.pattern !== patternString);
  }

  /**
   * Check if URL matches any of the configured patterns
   */
  matches(url: string): UrlMatchResult {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const fullUrl = url;

      for (const pattern of this.patterns) {
        const result = this.matchSinglePattern(fullUrl, pathname, pattern);
        if (result.matches) {
          return {
            matches: true,
            matchedPattern: pattern,
            matchedPart: result.matchedPart
          };
        }
      }

      return { matches: false };
    } catch (error) {
      // Invalid URL, no match
      return { matches: false };
    }
  }

  /**
   * Get all configured patterns
   */
  getPatterns(): UrlPattern[] {
    return [...this.patterns];
  }

  /**
   * Parse string pattern and determine type
   */
  public parseStringPattern(pattern: string): UrlPattern {
    // Remove leading/trailing whitespace
    pattern = pattern.trim();

    // Regex pattern (starts and ends with /)
    if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
      return {
        pattern: pattern.slice(1, -1), // Remove surrounding slashes
        type: 'regex',
        caseSensitive: true
      };
    }

    // Check for complex glob patterns first (contains * or ? in middle or multiple wildcards)
    const starCount = (pattern.match(/\*/g) || []).length;
    const hasQuestionMark = pattern.includes('?');
    const hasMiddleWildcard = pattern.slice(1, -1).includes('*') || pattern.slice(1, -1).includes('?');
    
    if (hasQuestionMark || starCount > 1 || hasMiddleWildcard) {
      return {
        pattern,
        type: 'glob',
        caseSensitive: false
      };
    }

    // Contains pattern (starts and ends with * but not just *)
    if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
      return {
        pattern: pattern.slice(1, -1),
        type: 'contains',
        caseSensitive: false
      };
    }

    // Prefix pattern (ends with * but doesn't start with *)
    if (pattern.endsWith('*') && !pattern.startsWith('*')) {
      return {
        pattern: pattern.slice(0, -1),
        type: 'prefix',
        caseSensitive: false
      };
    }

    // Suffix pattern (starts with * but doesn't end with *)
    if (pattern.startsWith('*') && !pattern.endsWith('*')) {
      return {
        pattern: pattern.slice(1),
        type: 'suffix',
        caseSensitive: false
      };
    }

    // Default to prefix matching for simple paths
    return {
      pattern,
      type: 'prefix',
      caseSensitive: false
    };
  }

  /**
   * Match a single pattern against URL components
   */
  private matchSinglePattern(fullUrl: string, pathname: string, pattern: UrlPattern): UrlMatchResult {
    const target = pathname; // Focus on pathname for most patterns
    const patternStr = pattern.caseSensitive ? pattern.pattern : pattern.pattern.toLowerCase();
    const targetStr = pattern.caseSensitive ? target : target.toLowerCase();

    switch (pattern.type) {
      case 'exact':
        return {
          matches: targetStr === patternStr,
          matchedPart: targetStr === patternStr ? target : undefined
        };

      case 'prefix':
        const prefixMatches = targetStr.startsWith(patternStr);
        return {
          matches: prefixMatches,
          matchedPart: prefixMatches ? target.substring(0, pattern.pattern.length) : undefined
        };

      case 'suffix':
        const suffixMatches = targetStr.endsWith(patternStr);
        return {
          matches: suffixMatches,
          matchedPart: suffixMatches ? target.substring(target.length - pattern.pattern.length) : undefined
        };

      case 'contains':
        const containsIndex = targetStr.indexOf(patternStr);
        return {
          matches: containsIndex !== -1,
          matchedPart: containsIndex !== -1 ? target.substring(containsIndex, containsIndex + pattern.pattern.length) : undefined
        };

      case 'regex':
        try {
          const regex = new RegExp(pattern.pattern, pattern.caseSensitive ? 'g' : 'gi');
          const match = regex.exec(targetStr);
          return {
            matches: match !== null,
            matchedPart: match ? match[0] : undefined
          };
        } catch (error) {
          // Invalid regex, no match
          return { matches: false };
        }

      case 'glob':
        return this.matchGlobPattern(targetStr, patternStr);

      default:
        return { matches: false };
    }
  }

  /**
   * Match glob pattern (* and ? wildcards)
   */
  private matchGlobPattern(target: string, pattern: string): UrlMatchResult {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
      .replace(/\*/g, '.*') // * matches any characters
      .replace(/\?/g, '.'); // ? matches single character

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      const match = regex.exec(target);
      return {
        matches: match !== null,
        matchedPart: match ? match[0] : undefined
      };
    } catch (error) {
      return { matches: false };
    }
  }
}

/**
 * Utility functions for common pattern matching scenarios
 */
export class UrlPatternUtils {
  /**
   * Create patterns for common exclusion scenarios
   */
  static createCommonExclusionPatterns(): UrlPattern[] {
    return [
      { pattern: '/admin', type: 'prefix', caseSensitive: false },
      { pattern: '/api', type: 'prefix', caseSensitive: false },
      { pattern: '/private', type: 'prefix', caseSensitive: false },
      { pattern: '/internal', type: 'prefix', caseSensitive: false },
      { pattern: '/test', type: 'prefix', caseSensitive: false },
      { pattern: '/dev', type: 'prefix', caseSensitive: false },
      { pattern: '/staging', type: 'prefix', caseSensitive: false },
      { pattern: '*.pdf', type: 'glob', caseSensitive: false },
      { pattern: '*.zip', type: 'glob', caseSensitive: false },
      { pattern: '*.exe', type: 'glob', caseSensitive: false },
      { pattern: '/wp-admin', type: 'prefix', caseSensitive: false },
      { pattern: '/wp-content/uploads', type: 'prefix', caseSensitive: false }
    ];
  }

  /**
   * Validate pattern syntax
   */
  static validatePattern(pattern: string): { valid: boolean; error?: string } {
    try {
      if (!pattern.trim()) {
        return { valid: false, error: 'Pattern cannot be empty' };
      }

      const matcher = new UrlPatternMatcher();
      const urlPattern = matcher.parseStringPattern(pattern);
      
      // Special validation for regex patterns
      if (urlPattern.type === 'regex') {
        try {
          new RegExp(urlPattern.pattern);
        } catch (regexError) {
          return { 
            valid: false, 
            error: 'Invalid regular expression: ' + (regexError instanceof Error ? regexError.message : 'Unknown error')
          };
        }
      }
      
      // Try to match against a test URL to validate the pattern
      matcher.setPatterns([pattern]);
      matcher.matches('https://example.com/test');
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid pattern' 
      };
    }
  }

  /**
   * Get pattern type description for UI
   */
  static getPatternTypeDescription(pattern: string): string {
    const matcher = new UrlPatternMatcher();
    const urlPattern = matcher.parseStringPattern(pattern);
    
    switch (urlPattern.type) {
      case 'exact':
        return 'Exact match';
      case 'prefix':
        return 'Starts with';
      case 'suffix':
        return 'Ends with';
      case 'contains':
        return 'Contains';
      case 'regex':
        return 'Regular expression';
      case 'glob':
        return 'Glob pattern (* and ?)';
      default:
        return 'Unknown';
    }
  }
}
import { AccessibilityAnalyzer } from '../services/accessibility-analyzer.service';
import { Page } from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';
import { WCAGViolation, AccessibilityReport } from '@enterprise-web-crawler/shared';

// Mock dependencies
jest.mock('@axe-core/puppeteer');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('AccessibilityAnalyzer', () => {
  let analyzer: AccessibilityAnalyzer;
  let mockPage: jest.Mocked<Page>;
  let mockAxeBuilder: jest.Mocked<AxePuppeteer>;

  beforeEach(() => {
    analyzer = new AccessibilityAnalyzer();
    
    // Mock Page
    mockPage = {
      setDefaultTimeout: jest.fn()
    } as any;

    // Mock AxePuppeteer
    mockAxeBuilder = {
      withTags: jest.fn().mockReturnThis(),
      configure: jest.fn().mockReturnThis(),
      analyze: jest.fn()
    } as any;

    (AxePuppeteer as jest.MockedClass<typeof AxePuppeteer>).mockImplementation(() => mockAxeBuilder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzePage', () => {
    const mockUrl = 'https://example.com';
    
    const mockAxeResults = {
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          tags: ['wcag2aa', 'wcag21aa'],
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure sufficient color contrast',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
          nodes: [
            {
              html: '<p>Low contrast text</p>',
              target: ['p'],
              failureSummary: 'Fix color contrast'
            }
          ]
        }
      ],
      passes: [
        {
          id: 'image-alt',
          impact: null,
          tags: ['wcag2a', 'wcag2aa'],
          description: 'Images must have alternate text',
          help: 'Images must have alternate text',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/image-alt',
          nodes: [
            {
              html: '<img src="test.jpg" alt="Test image">',
              target: ['img']
            }
          ]
        }
      ],
      incomplete: [
        {
          id: 'color-contrast',
          impact: 'serious',
          tags: ['wcag2aa'],
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure sufficient color contrast',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
          nodes: [
            {
              html: '<div>Text on background</div>',
              target: ['div'],
              message: 'Unable to determine contrast ratio'
            }
          ]
        }
      ]
    } as any;

    beforeEach(() => {
      mockAxeBuilder.analyze.mockResolvedValue(mockAxeResults);
    });

    it('should successfully analyze a page and return accessibility report', async () => {
      const result = await analyzer.analyzePage(mockPage, mockUrl);

      expect(result).toMatchObject({
        url: mockUrl,
        violations: expect.arrayContaining([
          expect.objectContaining({
            id: 'color-contrast',
            impact: 'serious',
            wcagLevel: 'AA',
            remediation: expect.stringContaining('color contrast')
          })
        ]),
        passes: expect.arrayContaining([
          expect.objectContaining({
            id: 'image-alt',
            impact: null
          })
        ]),
        incomplete: expect.arrayContaining([
          expect.objectContaining({
            id: 'color-contrast',
            impact: 'serious'
          })
        ]),
        score: expect.any(Number),
        timestamp: expect.any(Date)
      });

      expect(AxePuppeteer).toHaveBeenCalledWith(mockPage);
      expect(mockAxeBuilder.withTags).toHaveBeenCalledWith(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
      expect(mockAxeBuilder.configure).toHaveBeenCalled();
      expect(mockAxeBuilder.analyze).toHaveBeenCalled();
    });

    it('should apply custom configuration', async () => {
      const customConfig = {
        wcagLevel: 'AAA' as const,
        tags: ['wcag2aaa'],
        timeout: 60000
      };

      await analyzer.analyzePage(mockPage, mockUrl, customConfig);

      expect(mockAxeBuilder.withTags).toHaveBeenCalledWith(['wcag2aaa']);
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(60000);
    });

    it('should handle analysis errors gracefully', async () => {
      const error = new Error('Axe analysis failed');
      mockAxeBuilder.analyze.mockRejectedValue(error);

      await expect(analyzer.analyzePage(mockPage, mockUrl)).rejects.toThrow('Accessibility analysis failed: Axe analysis failed');
    });

    it('should handle unknown errors', async () => {
      mockAxeBuilder.analyze.mockRejectedValue('Unknown error');

      await expect(analyzer.analyzePage(mockPage, mockUrl)).rejects.toThrow('Accessibility analysis failed: Unknown error');
    });

    it('should convert multiple violation nodes to separate issues', async () => {
      const reportWithMultipleNodes = {
        violations: [
          {
            id: 'image-alt',
            impact: 'critical',
            tags: ['wcag2a'],
            description: 'Images must have alternate text',
            help: 'Add alt text to images',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<img src="img1.jpg">',
                target: ['img:nth-child(1)'],
                failureSummary: 'Missing alt text'
              },
              {
                html: '<img src="img2.jpg">',
                target: ['img:nth-child(2)'],
                failureSummary: 'Missing alt text'
              }
            ]
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(reportWithMultipleNodes);

      const result = await analyzer.analyzePage(mockPage, mockUrl);

      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].nodes).toHaveLength(2);
      expect(result.violations[0].nodes[0].target).toEqual(['img:nth-child(1)']);
      expect(result.violations[0].nodes[1].target).toEqual(['img:nth-child(2)']);
    });

    it('should handle incomplete accessibility results', async () => {
      const reportWithIncomplete = {
        violations: [],
        passes: [],
        incomplete: [
          {
            id: 'color-contrast',
            impact: 'serious',
            tags: ['wcag2aa'],
            description: 'Elements must have sufficient color contrast',
            help: 'Ensure sufficient color contrast',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<div>Background image text</div>',
                target: ['div'],
                message: 'Unable to determine contrast ratio'
              }
            ]
          }
        ]
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(reportWithIncomplete);

      const result = await analyzer.analyzePage(mockPage, mockUrl);

      expect(result.incomplete).toHaveLength(1);
      expect(result.incomplete[0].id).toBe('color-contrast');
      expect(result.incomplete[0].nodes[0].message).toBe('Unable to determine contrast ratio');
    });
  });

  describe('calculateComplianceScore', () => {
    it('should calculate perfect score with no violations', () => {
      const violations: WCAGViolation[] = [];
      
      const score = analyzer.calculateComplianceScore(violations);
      
      expect(score.overall).toBe(100);
      expect(score.perceivable).toBe(100);
      expect(score.operable).toBe(100);
      expect(score.understandable).toBe(100);
      expect(score.robust).toBe(100);
      expect(score.violationCount).toEqual({
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0
      });
    });

    it('should calculate score with various violation severities', () => {
      const violations: WCAGViolation[] = [
        {
          id: 'color-contrast',
          impact: 'critical',
          tags: ['wcag2aa'],
          description: 'Critical violation',
          help: 'Fix critical issue',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'AA',
          wcagGuideline: 'wcag2aa',
          remediation: 'Fix this'
        },
        {
          id: 'image-alt',
          impact: 'serious',
          tags: ['wcag2a'],
          description: 'Serious violation',
          help: 'Fix serious issue',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'A',
          wcagGuideline: 'wcag2a',
          remediation: 'Fix this'
        },
        {
          id: 'heading-order',
          impact: 'moderate',
          tags: ['wcag2a'],
          description: 'Moderate violation',
          help: 'Fix moderate issue',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'A',
          wcagGuideline: 'wcag2a',
          remediation: 'Fix this'
        },
        {
          id: 'link-name',
          impact: 'minor',
          tags: ['wcag2a'],
          description: 'Minor violation',
          help: 'Fix minor issue',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'A',
          wcagGuideline: 'wcag2a',
          remediation: 'Fix this'
        }
      ];

      const score = analyzer.calculateComplianceScore(violations);
      
      // Score should be 100 - (25 + 15 + 8 + 3) = 49
      expect(score.overall).toBe(49);
      expect(score.violationCount).toEqual({
        critical: 1,
        serious: 1,
        moderate: 1,
        minor: 1
      });
    });

    it('should not go below 0 for score', () => {
      const violations: WCAGViolation[] = Array(10).fill(null).map((_, i) => ({
        id: `violation-${i}`,
        impact: 'critical' as const,
        tags: ['wcag2aa'],
        description: 'Critical violation',
        help: 'Fix critical issue',
        helpUrl: 'https://example.com',
        nodes: [],
        wcagLevel: 'AA' as const,
        wcagGuideline: 'wcag2aa',
        remediation: 'Fix this'
      }));

      const score = analyzer.calculateComplianceScore(violations);
      
      expect(score.overall).toBe(0);
    });
  });

  describe('WCAG principle categorization', () => {
    it('should correctly categorize perceivable violations', () => {
      const violations: WCAGViolation[] = [
        {
          id: 'color-contrast',
          impact: 'serious',
          tags: ['color-contrast', 'wcag2aa'],
          description: 'Color contrast violation',
          help: 'Fix color contrast',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'AA',
          wcagGuideline: 'wcag2aa',
          remediation: 'Fix this'
        }
      ];

      const score = analyzer.calculateComplianceScore(violations);
      
      // Perceivable should be affected, others should be perfect
      expect(score.perceivable).toBeLessThan(100);
      expect(score.operable).toBe(100);
      expect(score.understandable).toBe(100);
      expect(score.robust).toBe(100);
    });

    it('should correctly categorize operable violations', () => {
      const violations: WCAGViolation[] = [
        {
          id: 'keyboard-navigation',
          impact: 'serious',
          tags: ['keyboard', 'wcag2aa'],
          description: 'Keyboard navigation violation',
          help: 'Fix keyboard navigation',
          helpUrl: 'https://example.com',
          nodes: [],
          wcagLevel: 'AA',
          wcagGuideline: 'wcag2aa',
          remediation: 'Fix this'
        }
      ];

      const score = analyzer.calculateComplianceScore(violations);
      
      // Operable should be affected, others should be perfect
      expect(score.perceivable).toBe(100);
      expect(score.operable).toBeLessThan(100);
      expect(score.understandable).toBe(100);
      expect(score.robust).toBe(100);
    });
  });

  describe('remediation guidance', () => {
    it('should provide specific remediation for known rules', async () => {
      const mockResults = {
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            tags: ['wcag2aa'],
            description: 'Color contrast violation',
            help: 'Fix color contrast',
            helpUrl: 'https://example.com',
            nodes: []
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(mockResults);

      const result = await analyzer.analyzePage(mockPage, 'https://example.com');
      
      expect(result.violations[0].remediation).toContain('color contrast');
      expect(result.violations[0].remediation).toContain('4.5:1');
    });

    it('should provide generic remediation for unknown rules', async () => {
      const mockResults = {
        violations: [
          {
            id: 'unknown-rule',
            impact: 'serious',
            tags: ['wcag2aa'],
            description: 'Unknown violation',
            help: 'Fix unknown issue',
            helpUrl: 'https://example.com',
            nodes: []
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(mockResults);

      const result = await analyzer.analyzePage(mockPage, 'https://example.com');
      
      expect(result.violations[0].remediation).toContain('WCAG 2.2 AA accessibility standards');
    });
  });

  describe('WCAG level determination', () => {
    it('should correctly determine WCAG AAA level', async () => {
      const mockResults = {
        violations: [
          {
            id: 'test-rule',
            impact: 'serious',
            tags: ['wcag2aaa', 'wcag21aaa'],
            description: 'AAA level violation',
            help: 'Fix AAA issue',
            helpUrl: 'https://example.com',
            nodes: []
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(mockResults);

      const result = await analyzer.analyzePage(mockPage, 'https://example.com');
      
      expect(result.violations[0].wcagLevel).toBe('AAA');
    });

    it('should correctly determine WCAG AA level', async () => {
      const mockResults = {
        violations: [
          {
            id: 'test-rule',
            impact: 'serious',
            tags: ['wcag2aa', 'wcag21aa'],
            description: 'AA level violation',
            help: 'Fix AA issue',
            helpUrl: 'https://example.com',
            nodes: []
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(mockResults);

      const result = await analyzer.analyzePage(mockPage, 'https://example.com');
      
      expect(result.violations[0].wcagLevel).toBe('AA');
    });

    it('should default to WCAG A level', async () => {
      const mockResults = {
        violations: [
          {
            id: 'test-rule',
            impact: 'serious',
            tags: ['wcag2a'],
            description: 'A level violation',
            help: 'Fix A issue',
            helpUrl: 'https://example.com',
            nodes: []
          }
        ],
        passes: [],
        incomplete: []
      } as any;

      mockAxeBuilder.analyze.mockResolvedValue(mockResults);

      const result = await analyzer.analyzePage(mockPage, 'https://example.com');
      
      expect(result.violations[0].wcagLevel).toBe('A');
    });
  });
});
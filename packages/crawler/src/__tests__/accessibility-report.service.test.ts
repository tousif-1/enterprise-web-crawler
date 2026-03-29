import { AccessibilityReportService } from '../services/accessibility-report.service';
import { AccessibilityReport, WCAGViolation } from '@enterprise-web-crawler/shared';

describe('AccessibilityReportService', () => {
  let reportService: AccessibilityReportService;

  beforeEach(() => {
    reportService = new AccessibilityReportService();
  });

  describe('generateComplianceReport', () => {
    it('should generate a comprehensive compliance report', async () => {
      const reports: AccessibilityReport[] = [
        {
          url: 'https://example.com/page1',
          violations: [
            {
              id: 'color-contrast',
              impact: 'serious',
              description: 'Elements must have sufficient color contrast',
              help: 'Ensure all text elements have sufficient color contrast',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
              nodes: [
                {
                  html: '<p style="color: #999; background: #fff;">Low contrast text</p>',
                  target: ['p'],
                  failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast',
                },
              ],
            },
          ],
          passes: [
            {
              id: 'image-alt',
              impact: null,
              description: 'Images must have alternate text',
              help: 'Images must have alternate text',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/image-alt',
              nodes: [
                {
                  html: '<img src="test.jpg" alt="Test image">',
                  target: ['img'],
                },
              ],
            },
          ],
          incomplete: [],
          score: 85,
        },
        {
          url: 'https://example.com/page2',
          violations: [
            {
              id: 'heading-order',
              impact: 'moderate',
              description: 'Heading levels should only increase by one',
              help: 'Heading levels should only increase by one',
              helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/heading-order',
              nodes: [
                {
                  html: '<h1>Title</h1><h3>Subtitle</h3>',
                  target: ['h3'],
                  failureSummary: 'Fix any of the following:\n  Heading order invalid',
                },
              ],
            },
          ],
          passes: [],
          incomplete: [],
          score: 75,
        },
      ];

      const complianceReport = await reportService.generateComplianceReport(reports);

      expect(complianceReport).toEqual({
        totalPages: 2,
        averageScore: 80,
        totalViolations: 2,
        violationsByImpact: {
          minor: 0,
          moderate: 1,
          serious: 1,
          critical: 0,
        },
        violationsByCategory: {
          'color-contrast': 1,
          'heading-order': 1,
        },
        wcagComplianceLevel: 'AA',
        recommendations: expect.arrayContaining([
          expect.objectContaining({
            priority: 'high',
            category: 'color-contrast',
          }),
          expect.objectContaining({
            priority: 'medium',
            category: 'heading-order',
          }),
        ]),
      });
    });

    it('should handle empty reports array', async () => {
      const complianceReport = await reportService.generateComplianceReport([]);

      expect(complianceReport).toEqual({
        totalPages: 0,
        averageScore: 0,
        totalViolations: 0,
        violationsByImpact: {
          minor: 0,
          moderate: 0,
          serious: 0,
          critical: 0,
        },
        violationsByCategory: {},
        wcagComplianceLevel: 'AAA',
        recommendations: [],
      });
    });
  });

  describe('generateRemediationGuidance', () => {
    it('should generate specific remediation guidance for violations', async () => {
      const violations: WCAGViolation[] = [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure all text elements have sufficient color contrast',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
          nodes: [
            {
              html: '<p style="color: #999; background: #fff;">Low contrast text</p>',
              target: ['p'],
              failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast',
            },
          ],
        },
        {
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alternate text',
          help: 'Images must have alternate text',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/image-alt',
          nodes: [
            {
              html: '<img src="test.jpg">',
              target: ['img'],
              failureSummary: 'Fix any of the following:\n  Element does not have an alt attribute',
            },
          ],
        },
      ];

      const guidance = await reportService.generateRemediationGuidance(violations);

      expect(guidance).toHaveLength(2);
      expect(guidance[0]).toEqual({
        violationId: 'color-contrast',
        priority: 'high',
        category: 'color-contrast',
        title: 'Fix Color Contrast Issues',
        description: expect.stringContaining('color contrast'),
        steps: expect.arrayContaining([
          expect.stringContaining('contrast ratio'),
        ]),
        resources: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
            url: expect.any(String),
          }),
        ]),
      });

      expect(guidance[1]).toEqual({
        violationId: 'image-alt',
        priority: 'critical',
        category: 'image-alt',
        title: 'Add Alternative Text to Images',
        description: expect.stringContaining('alternative text'),
        steps: expect.arrayContaining([
          expect.stringContaining('alt attribute'),
        ]),
        resources: expect.arrayContaining([
          expect.objectContaining({
            title: expect.any(String),
            url: expect.any(String),
          }),
        ]),
      });
    });

    it('should handle empty violations array', async () => {
      const guidance = await reportService.generateRemediationGuidance([]);
      expect(guidance).toEqual([]);
    });
  });

  describe('calculateWCAGComplianceLevel', () => {
    it('should return AAA for perfect scores', () => {
      const reports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 100 },
        { url: 'test2', violations: [], passes: [], incomplete: [], score: 100 },
      ];

      const level = reportService.calculateWCAGComplianceLevel(reports);
      expect(level).toBe('AAA');
    });

    it('should return AA for good scores', () => {
      const reports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 90 },
        { url: 'test2', violations: [], passes: [], incomplete: [], score: 85 },
      ];

      const level = reportService.calculateWCAGComplianceLevel(reports);
      expect(level).toBe('AA');
    });

    it('should return A for moderate scores', () => {
      const reports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 75 },
        { url: 'test2', violations: [], passes: [], incomplete: [], score: 70 },
      ];

      const level = reportService.calculateWCAGComplianceLevel(reports);
      expect(level).toBe('A');
    });

    it('should return Non-compliant for low scores', () => {
      const reports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 50 },
        { url: 'test2', violations: [], passes: [], incomplete: [], score: 45 },
      ];

      const level = reportService.calculateWCAGComplianceLevel(reports);
      expect(level).toBe('Non-compliant');
    });
  });

  describe('generateTrendAnalysis', () => {
    it('should analyze accessibility trends over time', async () => {
      const currentReports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 85 },
      ];

      const previousReports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 80 },
      ];

      const trends = await reportService.generateTrendAnalysis(currentReports, previousReports);

      expect(trends).toEqual({
        scoreChange: 5,
        violationChange: 0,
        trend: 'improving',
        significantChanges: expect.any(Array),
      });
    });

    it('should handle missing previous reports', async () => {
      const currentReports: AccessibilityReport[] = [
        { url: 'test', violations: [], passes: [], incomplete: [], score: 85 },
      ];

      const trends = await reportService.generateTrendAnalysis(currentReports, []);

      expect(trends).toEqual({
        scoreChange: 0,
        violationChange: 0,
        trend: 'stable',
        significantChanges: [],
      });
    });
  });
});
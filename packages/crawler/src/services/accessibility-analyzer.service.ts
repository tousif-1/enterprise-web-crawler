import { AxePuppeteer } from '@axe-core/puppeteer';
import { Page } from 'puppeteer';
import { 
  AccessibilityReport, 
  WCAGViolation, 
  WCAGPass, 
  WCAGIncomplete, 
  ComplianceScore,
  AccessibilityAnalysisConfig,
  ViolationNode,
  PassNode,
  IncompleteNode
} from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

export class AccessibilityAnalyzer {
  private readonly defaultConfig: AccessibilityAnalysisConfig = {
    wcagLevel: 'AA',
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
    timeout: 30000
  };

  private readonly remediationGuidance: Record<string, string> = {
    'color-contrast': 'Ensure text has sufficient color contrast against its background. Use a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text.',
    'image-alt': 'Add descriptive alt text to images. Use alt="" for decorative images that don\'t convey important information.',
    'heading-order': 'Use heading elements (h1-h6) in logical order. Don\'t skip heading levels (e.g., don\'t jump from h1 to h3).',
    'link-name': 'Ensure links have descriptive text or accessible names. Avoid generic text like "click here" or "read more".',
    'button-name': 'Ensure buttons have accessible names that describe their purpose.',
    'form-field-multiple-labels': 'Each form field should have only one label. Remove duplicate labels or use aria-labelledby for complex labeling.',
    'label': 'Associate form controls with labels using the "for" attribute or by wrapping the control in the label element.',
    'aria-valid-attr-value': 'Ensure ARIA attributes have valid values according to the ARIA specification.',
    'aria-required-attr': 'Add required ARIA attributes for the specified ARIA role.',
    'keyboard': 'Ensure all interactive elements are keyboard accessible. Add tabindex="0" for focusable elements or tabindex="-1" for programmatically focusable elements.',
    'focus-order-semantics': 'Ensure the focus order follows the logical reading order of the page.',
    'bypass': 'Add skip links or landmarks to help users bypass repetitive content.',
    'page-has-heading-one': 'Ensure the page has exactly one h1 element that describes the main content.',
    'landmark-one-main': 'Ensure the page has exactly one main landmark.',
    'region': 'Ensure all content is contained within landmarks (main, nav, aside, etc.).'
  };

  /**
   * Analyzes a page for accessibility violations using Axe-core
   */
  async analyzePage(
    page: Page, 
    url: string, 
    config: Partial<AccessibilityAnalysisConfig> = {}
  ): Promise<AccessibilityReport> {
    const analysisConfig = { ...this.defaultConfig, ...config };
    
    try {
      logger.info(`Starting accessibility analysis for ${url}`);
      
      // Configure Axe with WCAG 2.2 AA rules
      const axeBuilder = new AxePuppeteer(page)
        .withTags(analysisConfig.tags!)
        .configure({
          rules: this.getWCAG22Rules()
        });

      // Add timeout if specified
      if (analysisConfig.timeout) {
        await page.setDefaultTimeout(analysisConfig.timeout);
      }

      // Run accessibility analysis
      const results = await axeBuilder.analyze();
      
      // Process violations
      const violations = this.processViolations(results.violations);
      const passes = this.processPasses(results.passes);
      const incomplete = this.processIncomplete(results.incomplete);
      
      // Calculate compliance score
      const score = this.calculateComplianceScore(violations);
      
      const report: AccessibilityReport = {
        url,
        violations,
        passes,
        incomplete,
        score: score.overall,
        timestamp: new Date()
      };

      logger.info(`Accessibility analysis completed for ${url}. Score: ${score.overall}, Violations: ${violations.length}`);
      
      return report;
      
    } catch (error) {
      logger.error(`Accessibility analysis failed for ${url}:`, error);
      throw new Error(`Accessibility analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Processes Axe violations into our format with remediation guidance
   */
  private processViolations(violations: any[]): WCAGViolation[] {
    return violations.map(violation => ({
      id: violation.id,
      impact: violation.impact || 'moderate',
      tags: violation.tags || [],
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: this.processViolationNodes(violation.nodes),
      wcagLevel: this.determineWCAGLevel(violation.tags),
      wcagGuideline: this.extractWCAGGuideline(violation.tags),
      remediation: this.getRemediationGuidance(violation.id)
    }));
  }

  /**
   * Processes Axe passes into our format
   */
  private processPasses(passes: any[]): WCAGPass[] {
    return passes.map(pass => ({
      id: pass.id,
      impact: null,
      tags: pass.tags || [],
      description: pass.description,
      help: pass.help,
      helpUrl: pass.helpUrl,
      nodes: this.processPassNodes(pass.nodes)
    }));
  }

  /**
   * Processes Axe incomplete results into our format
   */
  private processIncomplete(incomplete: any[]): WCAGIncomplete[] {
    return incomplete.map(item => ({
      id: item.id,
      impact: item.impact,
      tags: item.tags || [],
      description: item.description,
      help: item.help,
      helpUrl: item.helpUrl,
      nodes: this.processIncompleteNodes(item.nodes)
    }));
  }

  /**
   * Processes violation nodes
   */
  private processViolationNodes(nodes: any[]): ViolationNode[] {
    return nodes.map(node => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary,
      element: node.target?.[0] || undefined
    }));
  }

  /**
   * Processes pass nodes
   */
  private processPassNodes(nodes: any[]): PassNode[] {
    return nodes.map(node => ({
      html: node.html,
      target: node.target
    }));
  }

  /**
   * Processes incomplete nodes
   */
  private processIncompleteNodes(nodes: any[]): IncompleteNode[] {
    return nodes.map(node => ({
      html: node.html,
      target: node.target,
      message: node.message
    }));
  }

  /**
   * Calculates compliance score based on WCAG guidelines
   */
  calculateComplianceScore(violations: WCAGViolation[]): ComplianceScore {
    const violationCount = {
      critical: violations.filter(v => v.impact === 'critical').length,
      serious: violations.filter(v => v.impact === 'serious').length,
      moderate: violations.filter(v => v.impact === 'moderate').length,
      minor: violations.filter(v => v.impact === 'minor').length
    };

    // Calculate weighted score (0-100)
    const totalViolations = violationCount.critical + violationCount.serious + violationCount.moderate + violationCount.minor;
    const weightedScore = Math.max(0, 100 - (
      violationCount.critical * 25 +
      violationCount.serious * 15 +
      violationCount.moderate * 8 +
      violationCount.minor * 3
    ));

    // Calculate scores by WCAG principle
    const principleScores = this.calculatePrincipleScores(violations);

    return {
      overall: Math.round(weightedScore),
      perceivable: principleScores.perceivable,
      operable: principleScores.operable,
      understandable: principleScores.understandable,
      robust: principleScores.robust,
      violationCount
    };
  }

  /**
   * Calculates scores for each WCAG principle
   */
  private calculatePrincipleScores(violations: WCAGViolation[]): {
    perceivable: number;
    operable: number;
    understandable: number;
    robust: number;
  } {
    const principleViolations = {
      perceivable: violations.filter(v => this.isPerceivableViolation(v.tags)),
      operable: violations.filter(v => this.isOperableViolation(v.tags)),
      understandable: violations.filter(v => this.isUnderstandableViolation(v.tags)),
      robust: violations.filter(v => this.isRobustViolation(v.tags))
    };

    return {
      perceivable: this.calculatePrincipleScore(principleViolations.perceivable),
      operable: this.calculatePrincipleScore(principleViolations.operable),
      understandable: this.calculatePrincipleScore(principleViolations.understandable),
      robust: this.calculatePrincipleScore(principleViolations.robust)
    };
  }

  /**
   * Calculates score for a specific principle
   */
  private calculatePrincipleScore(violations: WCAGViolation[]): number {
    if (violations.length === 0) return 100;
    
    const weightedScore = Math.max(0, 100 - violations.reduce((score, violation) => {
      switch (violation.impact) {
        case 'critical': return score + 25;
        case 'serious': return score + 15;
        case 'moderate': return score + 8;
        case 'minor': return score + 3;
        default: return score + 5;
      }
    }, 0));

    return Math.round(weightedScore);
  }

  /**
   * Determines WCAG level from tags
   */
  private determineWCAGLevel(tags: string[]): 'A' | 'AA' | 'AAA' {
    if (tags.includes('wcag2aaa') || tags.includes('wcag21aaa') || tags.includes('wcag22aaa')) return 'AAA';
    if (tags.includes('wcag2aa') || tags.includes('wcag21aa') || tags.includes('wcag22aa')) return 'AA';
    return 'A';
  }

  /**
   * Extracts WCAG guideline from tags
   */
  private extractWCAGGuideline(tags: string[]): string {
    const wcagTag = tags.find(tag => tag.startsWith('wcag'));
    return wcagTag || 'Unknown';
  }

  /**
   * Gets remediation guidance for a specific rule
   */
  private getRemediationGuidance(ruleId: string): string {
    return this.remediationGuidance[ruleId] || 'Review the element and ensure it meets WCAG 2.2 AA accessibility standards.';
  }

  /**
   * Checks if violation is related to Perceivable principle
   */
  private isPerceivableViolation(tags: string[]): boolean {
    const perceivableTags = ['color-contrast', 'image-alt', 'audio-caption', 'video-caption', 'sensory-and-visual-cues'];
    return tags.some(tag => perceivableTags.some(pTag => tag.includes(pTag)));
  }

  /**
   * Checks if violation is related to Operable principle
   */
  private isOperableViolation(tags: string[]): boolean {
    const operableTags = ['keyboard', 'focus', 'timing', 'seizure', 'navigation'];
    return tags.some(tag => operableTags.some(oTag => tag.includes(oTag)));
  }

  /**
   * Checks if violation is related to Understandable principle
   */
  private isUnderstandableViolation(tags: string[]): boolean {
    const understandableTags = ['language', 'readable', 'predictable', 'input-assistance'];
    return tags.some(tag => understandableTags.some(uTag => tag.includes(uTag)));
  }

  /**
   * Checks if violation is related to Robust principle
   */
  private isRobustViolation(tags: string[]): boolean {
    const robustTags = ['parsing', 'compatible'];
    return tags.some(tag => robustTags.some(rTag => tag.includes(rTag)));
  }

  /**
   * Gets WCAG 2.2 specific rules configuration
   */
  private getWCAG22Rules(): any {
    return {
      rules: {
        // WCAG 2.2 AA specific rules
        'color-contrast': { enabled: true },
        'color-contrast-enhanced': { enabled: false }, // AAA level
        'focus-order-semantics': { enabled: true },
        'target-size': { enabled: true }, // WCAG 2.2 new rule
        'focus-not-obscured': { enabled: true }, // WCAG 2.2 new rule
        'dragging-movements': { enabled: true }, // WCAG 2.2 new rule
        'consistent-help': { enabled: true }, // WCAG 2.2 new rule
        'redundant-entry': { enabled: true }, // WCAG 2.2 new rule
        'accessible-auth': { enabled: true } // WCAG 2.2 new rule
      }
    };
  }
}
import { AccessibilityReport, ComplianceScore, WCAGViolation } from '@enterprise-web-crawler/shared';
import { logger } from '../utils/logger';

export interface AccessibilityReportSummary {
  totalPages: number;
  averageScore: number;
  totalViolations: number;
  violationsByImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  violationsByPrinciple: {
    perceivable: number;
    operable: number;
    understandable: number;
    robust: number;
  };
  commonViolations: Array<{
    id: string;
    description: string;
    count: number;
    impact: string;
    remediation: string;
  }>;
  complianceDistribution: {
    excellent: number; // 90-100
    good: number;      // 70-89
    fair: number;      // 50-69
    poor: number;      // 0-49
  };
}

export interface AccessibilityTrendData {
  date: Date;
  averageScore: number;
  totalViolations: number;
  violationsByImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

/**
 * Service for generating accessibility reports and analytics
 */
export class AccessibilityReportService {
  
  /**
   * Generates a comprehensive summary from multiple accessibility reports
   */
  generateSummary(reports: AccessibilityReport[]): AccessibilityReportSummary {
    if (reports.length === 0) {
      return this.getEmptySummary();
    }

    logger.info(`Generating accessibility summary for ${reports.length} reports`);

    const totalPages = reports.length;
    const averageScore = this.calculateAverageScore(reports);
    const allViolations = reports.flatMap(report => report.violations);
    const totalViolations = allViolations.length;

    const violationsByImpact = this.categorizeViolationsByImpact(allViolations);
    const violationsByPrinciple = this.categorizeViolationsByPrinciple(allViolations);
    const commonViolations = this.identifyCommonViolations(allViolations);
    const complianceDistribution = this.calculateComplianceDistribution(reports);

    return {
      totalPages,
      averageScore,
      totalViolations,
      violationsByImpact,
      violationsByPrinciple,
      commonViolations,
      complianceDistribution
    };
  }

  /**
   * Generates trend data for accessibility metrics over time
   */
  generateTrendData(reportsByDate: Map<Date, AccessibilityReport[]>): AccessibilityTrendData[] {
    const trendData: AccessibilityTrendData[] = [];

    for (const [date, reports] of reportsByDate.entries()) {
      if (reports.length === 0) continue;

      const allViolations = reports.flatMap(report => report.violations);
      const averageScore = this.calculateAverageScore(reports);
      const violationsByImpact = this.categorizeViolationsByImpact(allViolations);

      trendData.push({
        date,
        averageScore,
        totalViolations: allViolations.length,
        violationsByImpact
      });
    }

    return trendData.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Identifies pages that need immediate attention based on critical violations
   */
  identifyPriorityPages(reports: AccessibilityReport[]): Array<{
    url: string;
    score: number;
    criticalViolations: number;
    seriousViolations: number;
    priorityScore: number;
  }> {
    return reports
      .map(report => {
        const criticalViolations = report.violations.filter(v => v.impact === 'critical').length;
        const seriousViolations = report.violations.filter(v => v.impact === 'serious').length;
        
        // Priority score: lower is higher priority
        const priorityScore = report.score - (criticalViolations * 20) - (seriousViolations * 10);

        return {
          url: report.url,
          score: report.score,
          criticalViolations,
          seriousViolations,
          priorityScore
        };
      })
      .sort((a, b) => a.priorityScore - b.priorityScore)
      .slice(0, 10); // Top 10 priority pages
  }

  /**
   * Generates remediation recommendations based on common violations
   */
  generateRemediationRecommendations(reports: AccessibilityReport[]): Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
    affectedPages: number;
    estimatedEffort: string;
  }> {
    const allViolations = reports.flatMap(report => report.violations);
    const commonViolations = this.identifyCommonViolations(allViolations);

    return commonViolations
      .slice(0, 5) // Top 5 most common violations
      .map(violation => ({
        category: violation.id,
        priority: this.mapImpactToPriority(violation.impact),
        recommendation: violation.remediation,
        affectedPages: violation.count,
        estimatedEffort: this.estimateRemediationEffort(violation.id, violation.count)
      }));
  }

  /**
   * Calculates accessibility score improvement potential
   */
  calculateImprovementPotential(reports: AccessibilityReport[]): {
    currentAverageScore: number;
    potentialScore: number;
    improvementPoints: number;
    quickWins: Array<{
      violation: string;
      impact: number;
      effort: 'low' | 'medium' | 'high';
    }>;
  } {
    const currentAverageScore = this.calculateAverageScore(reports);
    const allViolations = reports.flatMap(report => report.violations);
    
    // Calculate potential score if all violations were fixed
    const totalImpactPoints = allViolations.reduce((sum, violation) => {
      switch (violation.impact) {
        case 'critical': return sum + 25;
        case 'serious': return sum + 15;
        case 'moderate': return sum + 8;
        case 'minor': return sum + 3;
        default: return sum + 5;
      }
    }, 0);

    const potentialScore = Math.min(100, currentAverageScore + (totalImpactPoints / reports.length));
    const improvementPoints = potentialScore - currentAverageScore;

    // Identify quick wins (high impact, low effort violations)
    const quickWins = this.identifyQuickWins(allViolations);

    return {
      currentAverageScore,
      potentialScore: Math.round(potentialScore),
      improvementPoints: Math.round(improvementPoints),
      quickWins
    };
  }

  private calculateAverageScore(reports: AccessibilityReport[]): number {
    if (reports.length === 0) return 0;
    const totalScore = reports.reduce((sum, report) => sum + report.score, 0);
    return Math.round(totalScore / reports.length);
  }

  private categorizeViolationsByImpact(violations: WCAGViolation[]) {
    return {
      critical: violations.filter(v => v.impact === 'critical').length,
      serious: violations.filter(v => v.impact === 'serious').length,
      moderate: violations.filter(v => v.impact === 'moderate').length,
      minor: violations.filter(v => v.impact === 'minor').length
    };
  }

  private categorizeViolationsByPrinciple(violations: WCAGViolation[]) {
    return {
      perceivable: violations.filter(v => this.isPerceivableViolation(v.tags)).length,
      operable: violations.filter(v => this.isOperableViolation(v.tags)).length,
      understandable: violations.filter(v => this.isUnderstandableViolation(v.tags)).length,
      robust: violations.filter(v => this.isRobustViolation(v.tags)).length
    };
  }

  private identifyCommonViolations(violations: WCAGViolation[]) {
    const violationCounts = new Map<string, {
      id: string;
      description: string;
      count: number;
      impact: string;
      remediation: string;
    }>();

    violations.forEach(violation => {
      const existing = violationCounts.get(violation.id);
      if (existing) {
        existing.count++;
      } else {
        violationCounts.set(violation.id, {
          id: violation.id,
          description: violation.description,
          count: 1,
          impact: violation.impact,
          remediation: violation.remediation
        });
      }
    });

    return Array.from(violationCounts.values())
      .sort((a, b) => b.count - a.count);
  }

  private calculateComplianceDistribution(reports: AccessibilityReport[]) {
    const distribution = {
      excellent: 0, // 90-100
      good: 0,      // 70-89
      fair: 0,      // 50-69
      poor: 0       // 0-49
    };

    reports.forEach(report => {
      if (report.score >= 90) distribution.excellent++;
      else if (report.score >= 70) distribution.good++;
      else if (report.score >= 50) distribution.fair++;
      else distribution.poor++;
    });

    return distribution;
  }

  private mapImpactToPriority(impact: string): 'high' | 'medium' | 'low' {
    switch (impact) {
      case 'critical':
      case 'serious':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'minor':
      default:
        return 'low';
    }
  }

  private estimateRemediationEffort(violationId: string, count: number): string {
    const effortMap: Record<string, string> = {
      'color-contrast': 'Medium - Design changes required',
      'image-alt': 'Low - Add alt text to images',
      'heading-order': 'Low - Restructure heading hierarchy',
      'link-name': 'Low - Update link text',
      'button-name': 'Low - Add button labels',
      'form-field-multiple-labels': 'Medium - Restructure form labels',
      'label': 'Low - Associate labels with form controls',
      'aria-valid-attr-value': 'Medium - Fix ARIA attribute values',
      'aria-required-attr': 'Medium - Add required ARIA attributes',
      'keyboard': 'High - Implement keyboard navigation',
      'focus-order-semantics': 'High - Restructure focus order',
      'bypass': 'Medium - Add skip links or landmarks'
    };

    const baseEffort = effortMap[violationId] || 'Medium - Review and fix violations';
    const multiplier = count > 10 ? ' (High volume)' : count > 5 ? ' (Medium volume)' : '';
    
    return baseEffort + multiplier;
  }

  private identifyQuickWins(violations: WCAGViolation[]) {
    const quickWinRules = new Set([
      'image-alt',
      'link-name',
      'button-name',
      'heading-order',
      'label'
    ]);

    const quickWinViolations = violations.filter(v => quickWinRules.has(v.id));
    const quickWinCounts = new Map<string, number>();

    quickWinViolations.forEach(violation => {
      quickWinCounts.set(violation.id, (quickWinCounts.get(violation.id) || 0) + 1);
    });

    return Array.from(quickWinCounts.entries())
      .map(([violation, count]) => ({
        violation,
        impact: count * (violation === 'image-alt' ? 15 : 8), // Estimated score impact
        effort: 'low' as const
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);
  }

  private isPerceivableViolation(tags: string[]): boolean {
    const perceivableTags = ['color-contrast', 'image-alt', 'audio-caption', 'video-caption'];
    return tags.some(tag => perceivableTags.some(pTag => tag.includes(pTag)));
  }

  private isOperableViolation(tags: string[]): boolean {
    const operableTags = ['keyboard', 'focus', 'timing', 'seizure', 'navigation'];
    return tags.some(tag => operableTags.some(oTag => tag.includes(oTag)));
  }

  private isUnderstandableViolation(tags: string[]): boolean {
    const understandableTags = ['language', 'readable', 'predictable', 'input-assistance'];
    return tags.some(tag => understandableTags.some(uTag => tag.includes(uTag)));
  }

  private isRobustViolation(tags: string[]): boolean {
    const robustTags = ['parsing', 'compatible'];
    return tags.some(tag => robustTags.some(rTag => tag.includes(rTag)));
  }

  private getEmptySummary(): AccessibilityReportSummary {
    return {
      totalPages: 0,
      averageScore: 0,
      totalViolations: 0,
      violationsByImpact: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0
      },
      violationsByPrinciple: {
        perceivable: 0,
        operable: 0,
        understandable: 0,
        robust: 0
      },
      commonViolations: [],
      complianceDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0
      }
    };
  }
}
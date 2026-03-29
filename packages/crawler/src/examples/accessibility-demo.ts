#!/usr/bin/env ts-node

/**
 * Accessibility Analysis Demo
 * 
 * This script demonstrates how to use the AccessibilityAnalyzer
 * to analyze web pages for WCAG 2.2 AA compliance.
 * 
 * Usage: ts-node src/examples/accessibility-demo.ts
 */

import puppeteer from 'puppeteer';
import { AccessibilityAnalyzer } from '../services/accessibility-analyzer.service';
import { AccessibilityReportService } from '../services/accessibility-report.service';

async function runAccessibilityDemo() {
  console.log('🚀 Starting Accessibility Analysis Demo...\n');

  // Initialize browser and analyzer
  const browser = await puppeteer.launch({ headless: true });
  const analyzer = new AccessibilityAnalyzer();
  const reportService = new AccessibilityReportService();

  try {
    // URLs to analyze (you can modify these)
    const urlsToAnalyze = [
      'https://example.com',
      'https://httpbin.org/html',
      'https://www.w3.org/WAI/WCAG21/quickref/'
    ];

    console.log(`📊 Analyzing ${urlsToAnalyze.length} URLs for accessibility compliance...\n`);

    const reports = [];

    // Analyze each URL
    for (const url of urlsToAnalyze) {
      console.log(`🔍 Analyzing: ${url}`);
      
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Perform accessibility analysis
        const report = await analyzer.analyzePage(page, url);
        reports.push(report);
        
        console.log(`   ✅ Score: ${report.score}/100`);
        console.log(`   🚨 Violations: ${report.violations.length}`);
        console.log(`   ✅ Passes: ${report.passes.length}`);
        console.log(`   ⚠️  Incomplete: ${report.incomplete.length}\n`);
        
        // Show top violations
        if (report.violations.length > 0) {
          console.log('   Top violations:');
          report.violations.slice(0, 3).forEach((violation, index) => {
            console.log(`   ${index + 1}. ${violation.description} (${violation.impact})`);
            console.log(`      💡 ${violation.remediation}\n`);
          });
        }
        
        await page.close();
      } catch (error) {
        console.error(`   ❌ Failed to analyze ${url}:`, error instanceof Error ? error.message : error);
      }
    }

    // Generate summary report
    if (reports.length > 0) {
      console.log('📈 Generating Summary Report...\n');
      
      const summary = reportService.generateSummary(reports);
      
      console.log('='.repeat(60));
      console.log('📊 ACCESSIBILITY SUMMARY REPORT');
      console.log('='.repeat(60));
      console.log(`📄 Total Pages Analyzed: ${summary.totalPages}`);
      console.log(`📊 Average Score: ${summary.averageScore}/100`);
      console.log(`🚨 Total Violations: ${summary.totalViolations}`);
      console.log('');
      
      console.log('🎯 Violations by Impact:');
      console.log(`   🔴 Critical: ${summary.violationsByImpact.critical}`);
      console.log(`   🟠 Serious: ${summary.violationsByImpact.serious}`);
      console.log(`   🟡 Moderate: ${summary.violationsByImpact.moderate}`);
      console.log(`   🟢 Minor: ${summary.violationsByImpact.minor}`);
      console.log('');
      
      console.log('📋 Violations by WCAG Principle:');
      console.log(`   👁️  Perceivable: ${summary.violationsByPrinciple.perceivable}`);
      console.log(`   ⌨️  Operable: ${summary.violationsByPrinciple.operable}`);
      console.log(`   🧠 Understandable: ${summary.violationsByPrinciple.understandable}`);
      console.log(`   🔧 Robust: ${summary.violationsByPrinciple.robust}`);
      console.log('');
      
      console.log('📊 Compliance Distribution:');
      console.log(`   🌟 Excellent (90-100): ${summary.complianceDistribution.excellent}`);
      console.log(`   👍 Good (70-89): ${summary.complianceDistribution.good}`);
      console.log(`   👌 Fair (50-69): ${summary.complianceDistribution.fair}`);
      console.log(`   👎 Poor (0-49): ${summary.complianceDistribution.poor}`);
      console.log('');
      
      if (summary.commonViolations.length > 0) {
        console.log('🔥 Most Common Violations:');
        summary.commonViolations.slice(0, 5).forEach((violation, index) => {
          console.log(`   ${index + 1}. ${violation.description} (${violation.count} occurrences)`);
        });
        console.log('');
      }
      
      // Generate improvement recommendations
      const recommendations = reportService.generateRemediationRecommendations(reports);
      if (recommendations.length > 0) {
        console.log('💡 Top Remediation Recommendations:');
        recommendations.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec.category} (${rec.priority} priority)`);
          console.log(`      📝 ${rec.recommendation}`);
          console.log(`      📊 Affects ${rec.affectedPages} pages`);
          console.log(`      ⏱️  ${rec.estimatedEffort}\n`);
        });
      }
      
      // Calculate improvement potential
      const improvement = reportService.calculateImprovementPotential(reports);
      console.log('🎯 Improvement Potential:');
      console.log(`   📊 Current Average Score: ${improvement.currentAverageScore}/100`);
      console.log(`   🎯 Potential Score: ${improvement.potentialScore}/100`);
      console.log(`   📈 Improvement Points: +${improvement.improvementPoints}`);
      console.log('');
      
      if (improvement.quickWins.length > 0) {
        console.log('⚡ Quick Wins (Low Effort, High Impact):');
        improvement.quickWins.forEach((win, index) => {
          console.log(`   ${index + 1}. ${win.violation} (+${win.impact} points, ${win.effort} effort)`);
        });
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Analysis Complete!');
      console.log('='.repeat(60));
    }

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runAccessibilityDemo().catch(console.error);
}

export { runAccessibilityDemo };
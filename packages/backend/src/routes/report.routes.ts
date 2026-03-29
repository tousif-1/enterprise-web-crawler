import { Router, Request, Response } from 'express';
import { ReportService, ReportOptions } from '../services/report.service';
import { validationMiddleware } from '../middleware/validation.middleware';
import { logger } from '../utils/logger';
import Joi from 'joi';
import * as path from 'path';

const router = Router();
const reportService = new ReportService();

// Validation schemas
const reportOptionsSchema = Joi.object({
  includeDetails: Joi.boolean().default(false),
  includeTrends: Joi.boolean().default(false),
  format: Joi.string().valid('summary', 'detailed').default('summary'),
  dateRange: Joi.object({
    from: Joi.date(),
    to: Joi.date()
  }).optional()
});

const exportSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  format: Joi.string().valid('csv', 'html', 'pdf').required(),
  options: reportOptionsSchema.optional()
});

/**
 * GET /api/reports/:sessionId/data
 * Get report data for a session
 */
router.get('/:sessionId/data', 
  validationMiddleware({
    params: Joi.object({
      sessionId: Joi.string().uuid().required()
    }),
    query: reportOptionsSchema
  }),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const options: ReportOptions = req.query as any;

      logger.info(`Getting report data for session ${sessionId}`);

      const reportData = await reportService.generateReportData(sessionId, options);

      res.json({
        success: true,
        data: reportData
      });

    } catch (error) {
      logger.error('Error getting report data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate report data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/reports/export
 * Export report in specified format
 */
router.post('/export',
  validationMiddleware({
    body: exportSchema
  }),
  async (req: Request, res: Response) => {
    try {
      const { sessionId, format, options = {} } = req.body;

      logger.info(`Exporting report for session ${sessionId} in ${format} format`);

      let content: string;
      let contentType: string;
      let filename: string;

      // Generate timestamp for filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseFilename = `crawl-report-${sessionId}-${timestamp}`;

      switch (format) {
        case 'csv':
          content = await reportService.generateCSVReport(sessionId, options);
          contentType = 'text/csv';
          filename = `${baseFilename}.csv`;
          break;

        case 'html':
          content = await reportService.generateHTMLReport(sessionId, options);
          contentType = 'text/html';
          filename = `${baseFilename}.html`;
          break;

        case 'pdf':
          // For now, return HTML that can be converted to PDF client-side
          // In a full implementation, you might use puppeteer to generate PDF server-side
          content = await reportService.generateHTMLReport(sessionId, options);
          contentType = 'text/html';
          filename = `${baseFilename}.html`;
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Set response headers for file download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));

      // Send the content
      res.send(content);

      logger.info(`Report exported successfully for session ${sessionId}`);

    } catch (error) {
      logger.error('Error exporting report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reports/:sessionId/export/:format
 * Export report via GET request (for direct download links)
 */
router.get('/:sessionId/export/:format',
  validationMiddleware({
    params: Joi.object({
      sessionId: Joi.string().uuid().required(),
      format: Joi.string().valid('csv', 'html').required()
    }),
    query: reportOptionsSchema
  }),
  async (req: Request, res: Response) => {
    try {
      const { sessionId, format } = req.params;
      const options: ReportOptions = req.query as any;

      logger.info(`Exporting report for session ${sessionId} in ${format} format via GET`);

      let content: string;
      let contentType: string;
      let filename: string;

      // Generate timestamp for filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const baseFilename = `crawl-report-${sessionId}-${timestamp}`;

      switch (format) {
        case 'csv':
          content = await reportService.generateCSVReport(sessionId, options);
          contentType = 'text/csv';
          filename = `${baseFilename}.csv`;
          break;

        case 'html':
          content = await reportService.generateHTMLReport(sessionId, options);
          contentType = 'text/html';
          filename = `${baseFilename}.html`;
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Set response headers for file download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));

      // Send the content
      res.send(content);

      logger.info(`Report exported successfully for session ${sessionId}`);

    } catch (error) {
      logger.error('Error exporting report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reports/historical/:userId
 * Get historical data for trend analysis
 */
router.get('/historical/:userId',
  validationMiddleware({
    params: Joi.object({
      userId: Joi.string().required()
    }),
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(10)
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { limit } = req.query as any;

      logger.info(`Getting historical data for user ${userId}`);

      const historicalData = await reportService.getHistoricalData(userId, limit);

      res.json({
        success: true,
        data: historicalData
      });

    } catch (error) {
      logger.error('Error getting historical data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get historical data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/reports/:sessionId/summary
 * Get session summary for dashboard
 */
router.get('/:sessionId/summary',
  validationMiddleware({
    params: Joi.object({
      sessionId: Joi.string().uuid().required()
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      logger.info(`Getting summary for session ${sessionId}`);

      const reportData = await reportService.generateReportData(sessionId, { 
        format: 'summary',
        includeDetails: false 
      });

      res.json({
        success: true,
        data: {
          session: reportData.session,
          summary: reportData.summary
        }
      });

    } catch (error) {
      logger.error('Error getting session summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/reports/:sessionId/compare/:compareSessionId
 * Compare two sessions for trend analysis
 */
router.post('/:sessionId/compare/:compareSessionId',
  validationMiddleware({
    params: Joi.object({
      sessionId: Joi.string().uuid().required(),
      compareSessionId: Joi.string().uuid().required()
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { sessionId, compareSessionId } = req.params;

      logger.info(`Comparing sessions ${sessionId} and ${compareSessionId}`);

      const [currentData, compareData] = await Promise.all([
        reportService.generateReportData(sessionId, { format: 'summary' }),
        reportService.generateReportData(compareSessionId, { format: 'summary' })
      ]);

      const comparison = {
        current: {
          session: currentData.session,
          summary: currentData.summary
        },
        compare: {
          session: compareData.session,
          summary: compareData.summary
        },
        changes: {
          totalResultsChange: currentData.summary.totalResults - compareData.summary.totalResults,
          successRateChange: (currentData.summary.successCount / currentData.summary.totalResults) - 
                            (compareData.summary.successCount / compareData.summary.totalResults),
          averageScoreChange: currentData.summary.averageAccessibilityScore - compareData.summary.averageAccessibilityScore,
          issueCountChange: currentData.summary.issueStats.totalIssues - compareData.summary.issueStats.totalIssues,
          responseTimeChange: currentData.summary.averageResponseTime - compareData.summary.averageResponseTime
        }
      };

      res.json({
        success: true,
        data: comparison
      });

    } catch (error) {
      logger.error('Error comparing sessions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to compare sessions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export { router as reportRoutes };
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  Download as DownloadIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import { CrawlSession } from '@enterprise-web-crawler/shared';
import { apiService } from '../../services/api';

interface ReportData {
  session: CrawlSession;
  summary: SessionSummary;
  trends?: TrendData;
}

interface SessionSummary {
  totalResults: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  averageResponseTime: number;
  averageAccessibilityScore: number;
  issueStats: IssueStats;
}

interface IssueStats {
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  brokenLinkIssues: number;
  accessibilityIssues: number;
  missingImageIssues: number;
  performanceIssues: number;
}

interface TrendData {
  previousSession?: CrawlSession;
  comparison: {
    totalResultsChange: number;
    successRateChange: number;
    averageScoreChange: number;
    issueCountChange: number;
  };
}

interface ReportDashboardProps {
  sessionId: string;
}

export const ReportDashboard: React.FC<ReportDashboardProps> = ({ sessionId }) => {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'html'>('csv');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadReportData();
  }, [sessionId]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.get(`/reports/${sessionId}/data`, {
        params: {
          includeDetails: false,
          includeTrends: true,
          format: 'summary'
        }
      });

      setReportData(response.data.data);
    } catch (err) {
      console.error('Error loading report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      const response = await apiService.get(`/reports/${sessionId}/export/${exportFormat}`, {
        params: {
          includeDetails: true,
          includeTrends: true
        },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.setAttribute('download', `crawl-report-${sessionId}-${timestamp}.${exportFormat}`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const getSuccessRate = (summary: SessionSummary) => {
    if (summary.totalResults === 0) return 0;
    return (summary.successCount / summary.totalResults) * 100;
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUpIcon color="success" />;
    if (value < 0) return <TrendingDownIcon color="error" />;
    return null;
  };

  const getTrendColor = (value: number, inverse = false) => {
    if (inverse) {
      return value > 0 ? 'error' : value < 0 ? 'success' : 'default';
    }
    return value > 0 ? 'success' : value < 0 ? 'error' : 'default';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
        <Button onClick={loadReportData} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  if (!reportData) {
    return (
      <Alert severity="info">
        No report data available for this session.
      </Alert>
    );
  }

  const { session, summary, trends } = reportData;
  const successRate = getSuccessRate(summary);

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            <AssessmentIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Report Dashboard
          </Typography>
          <Typography variant="h6" color="text.secondary">
            {session.name}
          </Typography>
          <Chip 
            label={session.status} 
            color={session.status === 'completed' ? 'success' : 'default'}
            sx={{ mt: 1 }}
          />
        </Box>
        
        <Box display="flex" gap={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Export Format</InputLabel>
            <Select
              value={exportFormat}
              label="Export Format"
              onChange={(e) => setExportFormat(e.target.value as 'csv' | 'html')}
            >
              <MenuItem value="csv">CSV</MenuItem>
              <MenuItem value="html">HTML</MenuItem>
            </Select>
          </FormControl>
          
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export Report'}
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={4}>
        {/* Crawl Results Summary */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Crawl Results
              </Typography>
              <Typography variant="h3" color="primary">
                {summary.totalResults}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total URLs Crawled
              </Typography>
              <Box mt={2}>
                <Typography variant="body2">
                  Success Rate: {successRate.toFixed(1)}%
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={successRate} 
                  sx={{ mt: 1 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Summary */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Performance
              </Typography>
              <Typography variant="h3" color="info.main">
                {summary.averageResponseTime.toFixed(0)}ms
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg Response Time
              </Typography>
              <Box mt={2}>
                <Typography variant="body2">
                  Accessibility Score: {summary.averageAccessibilityScore.toFixed(1)}
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={summary.averageAccessibilityScore} 
                  sx={{ mt: 1 }}
                  color="secondary"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Issues Summary */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Issues Found
              </Typography>
              <Typography variant="h3" color="warning.main">
                {summary.issueStats.totalIssues}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Issues
              </Typography>
              <Box mt={2} display="flex" gap={1} flexWrap="wrap">
                <Chip 
                  label={`${summary.issueStats.criticalIssues} Critical`} 
                  size="small" 
                  color="error" 
                />
                <Chip 
                  label={`${summary.issueStats.highIssues} High`} 
                  size="small" 
                  color="warning" 
                />
                <Chip 
                  label={`${summary.issueStats.mediumIssues} Medium`} 
                  size="small" 
                  color="info" 
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Status Breakdown */}
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status Breakdown
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Successful:</Typography>
                  <Chip 
                    label={summary.successCount} 
                    size="small" 
                    color="success" 
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Failed:</Typography>
                  <Chip 
                    label={summary.failedCount} 
                    size="small" 
                    color="error" 
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Skipped:</Typography>
                  <Chip 
                    label={summary.skippedCount} 
                    size="small" 
                    color="default" 
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Issue Types Breakdown */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Issue Types Breakdown
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="error.main">
                      {summary.issueStats.brokenLinkIssues}
                    </Typography>
                    <Typography variant="body2">Broken Links</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="warning.main">
                      {summary.issueStats.accessibilityIssues}
                    </Typography>
                    <Typography variant="body2">Accessibility</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="info.main">
                      {summary.issueStats.missingImageIssues}
                    </Typography>
                    <Typography variant="body2">Missing Images</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="secondary.main">
                      {summary.issueStats.performanceIssues}
                    </Typography>
                    <Typography variant="body2">Performance</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Trend Analysis */}
      {trends && trends.previousSession && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Trend Analysis
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Compared to: {trends.previousSession.name}
                </Typography>
                
                <Grid container spacing={3} mt={1}>
                  <Grid item xs={6} md={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getTrendIcon(trends.comparison.totalResultsChange)}
                      <Box>
                        <Typography variant="body2">Total Results</Typography>
                        <Typography 
                          variant="h6" 
                          color={getTrendColor(trends.comparison.totalResultsChange)}
                        >
                          {trends.comparison.totalResultsChange >= 0 ? '+' : ''}
                          {trends.comparison.totalResultsChange}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={6} md={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getTrendIcon(trends.comparison.successRateChange)}
                      <Box>
                        <Typography variant="body2">Success Rate</Typography>
                        <Typography 
                          variant="h6" 
                          color={getTrendColor(trends.comparison.successRateChange)}
                        >
                          {trends.comparison.successRateChange >= 0 ? '+' : ''}
                          {(trends.comparison.successRateChange * 100).toFixed(1)}%
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={6} md={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getTrendIcon(trends.comparison.averageScoreChange)}
                      <Box>
                        <Typography variant="body2">Accessibility Score</Typography>
                        <Typography 
                          variant="h6" 
                          color={getTrendColor(trends.comparison.averageScoreChange)}
                        >
                          {trends.comparison.averageScoreChange >= 0 ? '+' : ''}
                          {trends.comparison.averageScoreChange.toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={6} md={3}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getTrendIcon(trends.comparison.issueCountChange)}
                      <Box>
                        <Typography variant="body2">Issue Count</Typography>
                        <Typography 
                          variant="h6" 
                          color={getTrendColor(trends.comparison.issueCountChange, true)}
                        >
                          {trends.comparison.issueCountChange >= 0 ? '+' : ''}
                          {trends.comparison.issueCountChange}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};
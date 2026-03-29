import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { CrawlSession } from '@enterprise-web-crawler/shared';
import { apiService } from '../../services/api';

interface HistoricalData {
  sessions: CrawlSession[];
  summaries: SessionSummary[];
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

interface ChartData {
  name: string;
  date: string;
  totalResults: number;
  successRate: number;
  accessibilityScore: number;
  responseTime: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

interface HistoricalTrendsProps {
  userId: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export const HistoricalTrends: React.FC<HistoricalTrendsProps> = ({ userId }) => {
  const [historicalData, setHistoricalData] = useState<HistoricalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'performance' | 'issues' | 'success'>('performance');
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadHistoricalData();
  }, [userId, limit]);

  const loadHistoricalData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.get(`/reports/historical/${userId}`, {
        params: { limit }
      });

      setHistoricalData(response.data.data);
    } catch (err) {
      console.error('Error loading historical data:', err);
      setError('Failed to load historical data');
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = (): ChartData[] => {
    if (!historicalData) return [];

    return historicalData.sessions.map((session, index) => {
      const summary = historicalData.summaries[index];
      const successRate = summary.totalResults > 0 
        ? (summary.successCount / summary.totalResults) * 100 
        : 0;

      return {
        name: session.name.length > 20 ? session.name.substring(0, 20) + '...' : session.name,
        date: new Date(session.createdAt).toLocaleDateString(),
        totalResults: summary.totalResults,
        successRate,
        accessibilityScore: summary.averageAccessibilityScore,
        responseTime: summary.averageResponseTime,
        totalIssues: summary.issueStats.totalIssues,
        criticalIssues: summary.issueStats.criticalIssues,
        highIssues: summary.issueStats.highIssues,
        mediumIssues: summary.issueStats.mediumIssues,
        lowIssues: summary.issueStats.lowIssues
      };
    }).reverse(); // Reverse to show chronological order
  };

  const getIssueTypeData = () => {
    if (!historicalData || historicalData.summaries.length === 0) return [];

    const latestSummary = historicalData.summaries[0];
    return [
      { name: 'Broken Links', value: latestSummary.issueStats.brokenLinkIssues },
      { name: 'Accessibility', value: latestSummary.issueStats.accessibilityIssues },
      { name: 'Missing Images', value: latestSummary.issueStats.missingImageIssues },
      { name: 'Performance', value: latestSummary.issueStats.performanceIssues }
    ].filter(item => item.value > 0);
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
        <Button onClick={loadHistoricalData} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  if (!historicalData || historicalData.sessions.length === 0) {
    return (
      <Alert severity="info">
        No historical data available. Run more crawl sessions to see trends.
      </Alert>
    );
  }

  const chartData = prepareChartData();
  const issueTypeData = getIssueTypeData();

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          Historical Trends
        </Typography>
        
        <Box display="flex" gap={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Chart Type</InputLabel>
            <Select
              value={chartType}
              label="Chart Type"
              onChange={(e) => setChartType(e.target.value as any)}
            >
              <MenuItem value="performance">Performance</MenuItem>
              <MenuItem value="issues">Issues</MenuItem>
              <MenuItem value="success">Success Rate</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Sessions</InputLabel>
            <Select
              value={limit}
              label="Sessions"
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <MenuItem value={5}>Last 5</MenuItem>
              <MenuItem value={10}>Last 10</MenuItem>
              <MenuItem value={20}>Last 20</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Main Trend Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {chartType === 'performance' && 'Performance Trends'}
                {chartType === 'issues' && 'Issue Trends'}
                {chartType === 'success' && 'Success Rate Trends'}
              </Typography>
              
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'performance' ? (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="accessibilityScore"
                      stroke="#8884d8"
                      name="Accessibility Score"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="responseTime"
                      stroke="#82ca9d"
                      name="Response Time (ms)"
                    />
                  </LineChart>
                ) : chartType === 'issues' ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="criticalIssues" stackId="a" fill="#FF8042" name="Critical" />
                    <Bar dataKey="highIssues" stackId="a" fill="#FFBB28" name="High" />
                    <Bar dataKey="mediumIssues" stackId="a" fill="#00C49F" name="Medium" />
                    <Bar dataKey="lowIssues" stackId="a" fill="#0088FE" name="Low" />
                  </BarChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="successRate"
                      stroke="#28a745"
                      name="Success Rate (%)"
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Issue Types Pie Chart */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Current Issue Types
              </Typography>
              
              {issueTypeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={issueTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {issueTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box display="flex" justifyContent="center" alignItems="center" height={300}>
                  <Typography variant="body2" color="text.secondary">
                    No issues found in latest session
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Summary Statistics */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Summary Statistics
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="primary">
                      {historicalData.sessions.length}
                    </Typography>
                    <Typography variant="body2">Total Sessions</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="success.main">
                      {historicalData.summaries.reduce((sum, s) => sum + s.totalResults, 0)}
                    </Typography>
                    <Typography variant="body2">Total URLs Crawled</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="warning.main">
                      {historicalData.summaries.reduce((sum, s) => sum + s.issueStats.totalIssues, 0)}
                    </Typography>
                    <Typography variant="body2">Total Issues Found</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} md={3}>
                  <Box textAlign="center">
                    <Typography variant="h4" color="info.main">
                      {(historicalData.summaries.reduce((sum, s) => sum + s.averageAccessibilityScore, 0) / historicalData.summaries.length).toFixed(1)}
                    </Typography>
                    <Typography variant="body2">Avg Accessibility Score</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
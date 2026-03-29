import React from 'react';
import { Card, CardContent, CardHeader, Box } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { CrawlSession, CrawlResult } from '@enterprise-web-crawler/shared';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface ProgressChartProps {
  session: CrawlSession;
  results: CrawlResult[];
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ session, results }) => {
  // Calculate issue distribution
  const issueStats = results.reduce(
    (acc, result) => {
      result.issues.forEach(issue => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      });
      return acc;
    },
    {} as Record<string, number>
  );

  // Status distribution data
  const statusData = {
    labels: ['Processed', 'Remaining', 'Failed'],
    datasets: [
      {
        data: [
          session.progress.processedUrls - session.progress.failedUrls,
          session.progress.totalUrls - session.progress.processedUrls,
          session.progress.failedUrls,
        ],
        backgroundColor: [
          '#4caf50', // Success green
          '#e0e0e0', // Gray for remaining
          '#f44336', // Error red
        ],
        borderWidth: 0,
      },
    ],
  };

  // Issue severity data
  const issueData = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [
      {
        label: 'Issues by Severity',
        data: [
          issueStats.critical || 0,
          issueStats.high || 0,
          issueStats.medium || 0,
          issueStats.low || 0,
        ],
        backgroundColor: [
          '#d32f2f', // Critical - dark red
          '#f57c00', // High - orange
          '#fbc02d', // Medium - yellow
          '#388e3c', // Low - green
        ],
        borderWidth: 1,
        borderColor: '#fff',
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
            return `${label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `${context.label}: ${context.parsed.y} issues`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  const totalIssues = Object.values(issueStats).reduce((sum, count) => sum + count, 0);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Progress Overview" />
      <CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Status Chart */}
          <Box>
            <Box sx={{ height: 200, mb: 2 }}>
              <Doughnut data={statusData} options={doughnutOptions} />
            </Box>
          </Box>

          {/* Issues Chart */}
          {totalIssues > 0 && (
            <Box>
              <Box sx={{ height: 200 }}>
                <Bar data={issueData} options={barOptions} />
              </Box>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
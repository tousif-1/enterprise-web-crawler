import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ReportDashboard } from '../../components/Reports/ReportDashboard';
import { apiService } from '../../services/api';

// Mock the API service
vi.mock('../../services/api');

// Mock recharts components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />
}));

const mockApiService = apiService as any;

const mockReportData = {
  session: {
    id: 'session-1',
    userId: 'user-1',
    name: 'Test Session',
    status: 'completed',
    config: {
      urls: ['https://example.com'],
      excludePaths: [],
      maxDepth: 3,
      concurrency: 5,
      respectRobots: true
    },
    startTime: new Date('2023-01-01T10:00:00Z'),
    endTime: new Date('2023-01-01T11:00:00Z'),
    progress: {
      totalUrls: 100,
      processedUrls: 100,
      failedUrls: 5
    },
    createdAt: new Date('2023-01-01T10:00:00Z'),
    updatedAt: new Date('2023-01-01T11:00:00Z')
  },
  summary: {
    totalResults: 100,
    successCount: 95,
    failedCount: 5,
    skippedCount: 0,
    averageResponseTime: 125,
    averageAccessibilityScore: 80.5,
    issueStats: {
      totalIssues: 10,
      criticalIssues: 2,
      highIssues: 3,
      mediumIssues: 3,
      lowIssues: 2,
      brokenLinkIssues: 4,
      accessibilityIssues: 5,
      missingImageIssues: 1,
      performanceIssues: 0
    }
  },
  trends: {
    previousSession: {
      id: 'session-0',
      name: 'Previous Session'
    },
    comparison: {
      totalResultsChange: 10,
      successRateChange: 0.05,
      averageScoreChange: 5.5,
      issueCountChange: -2
    }
  }
};

describe('ReportDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    mockApiService.get.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<ReportDashboard sessionId="session-1" />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render report data after loading', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Report Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Session')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // Total results
    expect(screen.getByText('125ms')).toBeInTheDocument(); // Avg response time
    expect(screen.getByText('10')).toBeInTheDocument(); // Total issues
  });

  it('should display session status chip', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  it('should show success rate calculation', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Success Rate: 95.0%')).toBeInTheDocument();
    });
  });

  it('should display issue breakdown', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument(); // Broken links
      expect(screen.getByText('5')).toBeInTheDocument(); // Accessibility issues
      expect(screen.getByText('1')).toBeInTheDocument(); // Missing images
      expect(screen.getByText('0')).toBeInTheDocument(); // Performance issues
    });
  });

  it('should show trend analysis when available', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
      expect(screen.getByText('Previous Session')).toBeInTheDocument();
      expect(screen.getByText('+10')).toBeInTheDocument(); // Total results change
      expect(screen.getByText('+5.0%')).toBeInTheDocument(); // Success rate change
      expect(screen.getByText('+5.5')).toBeInTheDocument(); // Score change
      expect(screen.getByText('-2')).toBeInTheDocument(); // Issue count change
    });
  });

  it('should handle export functionality', async () => {
    mockApiService.get
      .mockResolvedValueOnce({
        data: { data: mockReportData }
      })
      .mockResolvedValueOnce({
        data: new Blob(['csv content'], { type: 'text/csv' })
      });

    // Mock URL.createObjectURL and related functions
    const mockCreateObjectURL = vi.fn(() => 'mock-url');
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock document.createElement and appendChild
    const mockLink = {
      href: '',
      setAttribute: vi.fn(),
      click: vi.fn(),
      remove: vi.fn()
    };
    const mockCreateElement = vi.fn(() => mockLink);
    const mockAppendChild = vi.fn();
    document.createElement = mockCreateElement;
    document.body.appendChild = mockAppendChild;

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Export Report')).toBeInTheDocument();
    });

    const exportButton = screen.getByText('Export Report');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockApiService.get).toHaveBeenCalledWith(
        '/reports/session-1/export/csv',
        expect.objectContaining({
          params: {
            includeDetails: true,
            includeTrends: true
          },
          responseType: 'blob'
        })
      );
    });

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('should handle export format selection', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Export Format')).toBeInTheDocument();
    });

    const formatSelect = screen.getByLabelText('Export Format');
    fireEvent.mouseDown(formatSelect);

    const htmlOption = screen.getByText('HTML');
    fireEvent.click(htmlOption);

    expect(formatSelect).toHaveValue('html');
  });

  it('should handle API errors', async () => {
    mockApiService.get.mockRejectedValue(new Error('API Error'));

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should handle retry functionality', async () => {
    mockApiService.get
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        data: { data: mockReportData }
      });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report data')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });
  });

  it('should handle missing report data', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: null }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('No report data available for this session.')).toBeInTheDocument();
    });
  });

  it('should display correct issue severity chips', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 Critical')).toBeInTheDocument();
      expect(screen.getByText('3 High')).toBeInTheDocument();
      expect(screen.getByText('3 Medium')).toBeInTheDocument();
    });
  });

  it('should calculate and display accessibility score progress', async () => {
    mockApiService.get.mockResolvedValue({
      data: { data: mockReportData }
    });

    render(<ReportDashboard sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText('Accessibility Score: 80.5')).toBeInTheDocument();
    });

    // Check that LinearProgress is rendered (would need more specific testing for actual progress value)
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(1); // Success rate + accessibility score
  });
});
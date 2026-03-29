import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Typography,
  Box,
  Link,
  Tooltip,
  IconButton,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from '@mui/material';
import {
  Search as SearchIcon,
  OpenInNew as OpenInNewIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { CrawlResult } from '@enterprise-web-crawler/shared';
import { format } from 'date-fns';

interface ResultsTableProps {
  results: CrawlResult[];
  sessionId: string;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Filter results based on search and filters
  const filteredResults = results.filter(result => {
    const matchesSearch = result.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
    
    let matchesSeverity = true;
    if (severityFilter !== 'all') {
      if (severityFilter === 'no-issues') {
        matchesSeverity = result.issues.length === 0;
      } else {
        matchesSeverity = result.issues.some(issue => issue.severity === severityFilter);
      }
    }
    
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  const paginatedResults = filteredResults.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const getStatusIcon = (status: CrawlResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon color="success" fontSize="small" />;
      case 'failed':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'skipped':
        return <WarningIcon color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: CrawlResult['status']) => {
    switch (status) {
      case 'success': return 'success';
      case 'failed': return 'error';
      case 'skipped': return 'warning';
      default: return 'default';
    }
  };

  const getAccessibilityScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'error';
  };

  const getIssuesSummary = (result: CrawlResult) => {
    const counts = result.issues.reduce(
      (acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return { counts, total: result.issues.length };
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Card>
      <CardHeader 
        title="Crawl Results" 
        subheader={`${filteredResults.length} of ${results.length} results`}
      />
      <CardContent>
        {/* Filters */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search URLs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="success">Success</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
                <MenuItem value="skipped">Skipped</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Issues</InputLabel>
              <Select
                value={severityFilter}
                label="Issues"
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <MenuItem value="all">All Results</MenuItem>
                <MenuItem value="no-issues">No Issues</MenuItem>
                <MenuItem value="critical">Critical Issues</MenuItem>
                <MenuItem value="high">High Issues</MenuItem>
                <MenuItem value="medium">Medium Issues</MenuItem>
                <MenuItem value="low">Low Issues</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Results Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>URL</TableCell>
                <TableCell align="center">HTTP Status</TableCell>
                <TableCell align="center">Response Time</TableCell>
                <TableCell align="center">Accessibility Score</TableCell>
                <TableCell align="center">Issues</TableCell>
                <TableCell align="center">Last Modified</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedResults.map((result) => {
                const issuesSummary = getIssuesSummary(result);
                
                return (
                  <TableRow key={result.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getStatusIcon(result.status)}
                        <Chip
                          label={result.status.toUpperCase()}
                          color={getStatusColor(result.status)}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Tooltip title={result.url}>
                        <Link
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            maxWidth: 300,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {result.url}
                        </Link>
                      </Tooltip>
                    </TableCell>
                    
                    <TableCell align="center">
                      <Chip
                        label={result.httpStatus}
                        color={result.httpStatus < 400 ? 'success' : 'error'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.responseTime}ms
                      </Typography>
                    </TableCell>
                    
                    <TableCell align="center">
                      <Chip
                        label={`${result.accessibilityScore}%`}
                        color={getAccessibilityScoreColor(result.accessibilityScore)}
                        size="small"
                      />
                    </TableCell>
                    
                    <TableCell align="center">
                      {issuesSummary.total === 0 ? (
                        <Chip label="None" color="success" size="small" />
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {issuesSummary.total}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {issuesSummary.counts.critical && (
                              <Chip label={`C:${issuesSummary.counts.critical}`} color="error" size="small" />
                            )}
                            {issuesSummary.counts.high && (
                              <Chip label={`H:${issuesSummary.counts.high}`} color="warning" size="small" />
                            )}
                            {issuesSummary.counts.medium && (
                              <Chip label={`M:${issuesSummary.counts.medium}`} color="info" size="small" />
                            )}
                            {issuesSummary.counts.low && (
                              <Chip label={`L:${issuesSummary.counts.low}`} color="success" size="small" />
                            )}
                          </Box>
                        </Box>
                      )}
                    </TableCell>
                    
                    <TableCell align="center">
                      <Typography variant="body2" color="text.secondary">
                        {format(new Date(result.lastModified), 'MMM dd, HH:mm')}
                      </Typography>
                    </TableCell>
                    
                    <TableCell align="center">
                      <Tooltip title="Open URL">
                        <IconButton
                          size="small"
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredResults.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </CardContent>
    </Card>
  );
};
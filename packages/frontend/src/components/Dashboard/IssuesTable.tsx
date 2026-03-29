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
  Collapse,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { CrawlResult, Issue } from '@enterprise-web-crawler/shared';

interface IssuesTableProps {
  results: CrawlResult[];
}

interface IssueWithUrl extends Issue {
  url: string;
  resultId: string;
}

export const IssuesTable: React.FC<IssuesTableProps> = ({ results }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Flatten all issues with their URLs
  const allIssues: IssueWithUrl[] = results.flatMap(result =>
    result.issues.map(issue => ({
      ...issue,
      url: result.url,
      resultId: result.id,
    }))
  );

  // Sort by severity (critical first)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = allIssues.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.url.localeCompare(b.url);
  });

  const paginatedIssues = sortedIssues.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const getSeverityColor = (severity: Issue['severity']) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getIssueTypeIcon = (type: Issue['type']) => {
    switch (type) {
      case 'broken_link': return '🔗';
      case 'missing_image': return '🖼️';
      case 'accessibility': return '♿';
      case 'performance': return '⚡';
      default: return '❓';
    }
  };

  const toggleRowExpansion = (issueId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId);
    } else {
      newExpanded.add(issueId);
    }
    setExpandedRows(newExpanded);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (allIssues.length === 0) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardHeader title="Issues Found" />
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="success.main" gutterBottom>
              🎉 No Issues Found!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              All crawled pages are free of detected issues.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader 
        title="Issues Found" 
        subheader={`${allIssues.length} total issues across ${results.length} pages`}
      />
      <CardContent sx={{ flex: 1, overflow: 'hidden', p: 0 }}>
        <TableContainer sx={{ height: '100%' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell width="40px"></TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>URL</TableCell>
                <TableCell width="60px">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedIssues.map((issue) => (
                <React.Fragment key={`${issue.resultId}-${issue.id}`}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => toggleRowExpansion(issue.id)}
                        disabled={!issue.element && !issue.remediation && !issue.wcagGuideline}
                      >
                        {expandedRows.has(issue.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>{getIssueTypeIcon(issue.type)}</span>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {issue.type.replace('_', ' ')}
                        </Typography>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Chip
                        label={issue.severity.toUpperCase()}
                        color={getSeverityColor(issue.severity)}
                        size="small"
                      />
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 300 }}>
                        {issue.description}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Tooltip title={issue.url}>
                        <Link
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            maxWidth: 200,
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {issue.url}
                        </Link>
                      </Tooltip>
                    </TableCell>
                    
                    <TableCell>
                      <Tooltip title="Open URL">
                        <IconButton
                          size="small"
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded row with additional details */}
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0 }}>
                      <Collapse in={expandedRows.has(issue.id)} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                          {issue.wcagGuideline && (
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              <strong>WCAG Guideline:</strong> {issue.wcagGuideline}
                            </Typography>
                          )}
                          
                          {issue.element && (
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              <strong>Element:</strong>
                              <Box
                                component="code"
                                sx={{
                                  ml: 1,
                                  p: 0.5,
                                  bgcolor: 'grey.200',
                                  borderRadius: 1,
                                  fontSize: '0.75rem',
                                }}
                              >
                                {issue.element}
                              </Box>
                            </Typography>
                          )}
                          
                          {issue.remediation && (
                            <Typography variant="body2">
                              <strong>Remediation:</strong> {issue.remediation}
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={sortedIssues.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </CardContent>
    </Card>
  );
};
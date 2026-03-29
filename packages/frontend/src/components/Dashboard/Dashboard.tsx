import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Fade,
} from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { CrawlSession, CrawlResult, Issue } from '@enterprise-web-crawler/shared';
import { useSessionWebSocket } from '../../hooks/useWebSocket';
import { apiService } from '../../services/api';
import { StatusCard } from './StatusCard';
import { ProgressChart } from './ProgressChart';
import { IssuesTable } from './IssuesTable';
import { ResultsTable } from './ResultsTable';

interface DashboardProps {
  session: CrawlSession;
  onSessionUpdate?: (session: CrawlSession) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ session: initialSession, onSessionUpdate }) => {
  const [session, setSession] = useState<CrawlSession>(initialSession);
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [urgentIssues, setUrgentIssues] = useState<(Issue & { sessionId: string; url: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, subscribe } = useSessionWebSocket(session.id);

  // Load initial results
  useEffect(() => {
    const loadResults = async () => {
      try {
        const crawlResults = await apiService.getCrawlResults(session.id);
        setResults(crawlResults);
      } catch (err) {
        console.error('Failed to load results:', err);
        setError('Failed to load crawl results');
      }
    };

    loadResults();
  }, [session.id]);

  // Set up WebSocket subscriptions
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribers = [
      subscribe('session:updated', (updatedSession) => {
        if (updatedSession.id === session.id) {
          setSession(updatedSession);
          onSessionUpdate?.(updatedSession);
        }
      }),

      subscribe('session:progress', (data) => {
        if (data.sessionId === session.id) {
          setSession(prev => ({
            ...prev,
            progress: data.progress,
          }));
        }
      }),

      subscribe('result:new', (result) => {
        if (result.sessionId === session.id) {
          setResults(prev => [...prev, result]);
        }
      }),

      subscribe('result:updated', (result) => {
        if (result.sessionId === session.id) {
          setResults(prev => prev.map(r => r.id === result.id ? result : r));
        }
      }),

      subscribe('issue:urgent', (issue) => {
        if (issue.sessionId === session.id) {
          setUrgentIssues(prev => [...prev, issue]);
        }
      }),

      subscribe('error', (error) => {
        setError(error.message);
        setTimeout(() => setError(null), 5000);
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [isConnected, session.id, subscribe, onSessionUpdate]);

  const handlePauseResume = async () => {
    setLoading(true);
    try {
      if (session.status === 'running') {
        await apiService.pauseCrawlSession(session.id);
      } else if (session.status === 'paused') {
        await apiService.resumeCrawlSession(session.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const [updatedSession, crawlResults] = await Promise.all([
        apiService.getCrawlSession(session.id),
        apiService.getCrawlResults(session.id),
      ]);
      setSession(updatedSession);
      setResults(crawlResults);
      onSessionUpdate?.(updatedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: CrawlSession['status']) => {
    switch (status) {
      case 'running': return 'success';
      case 'paused': return 'warning';
      case 'completed': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getProgressPercentage = () => {
    if (session.progress.totalUrls === 0) return 0;
    return Math.round((session.progress.processedUrls / session.progress.totalUrls) * 100);
  };

  const criticalIssues = results.reduce((count, result) => 
    count + result.issues.filter(issue => issue.severity === 'critical').length, 0
  );

  const highIssues = results.reduce((count, result) => 
    count + result.issues.filter(issue => issue.severity === 'high').length, 0
  );

  return (
    <Box>
      {error && (
        <Fade in={!!error}>
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        </Fade>
      )}

      {urgentIssues.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">
            {urgentIssues.length} urgent issue{urgentIssues.length > 1 ? 's' : ''} detected!
          </Typography>
          <Typography variant="body2">
            Critical issues found that require immediate attention.
          </Typography>
        </Alert>
      )}

      {/* Session Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h5" gutterBottom>
                {session.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Chip
                  label={session.status.toUpperCase()}
                  color={getStatusColor(session.status)}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  Started: {new Date(session.startTime).toLocaleString()}
                </Typography>
                {!isConnected && (
                  <Chip label="Offline" color="error" size="small" />
                )}
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Refresh">
                <IconButton onClick={handleRefresh} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              
              {(session.status === 'running' || session.status === 'paused') && (
                <Tooltip title={session.status === 'running' ? 'Pause' : 'Resume'}>
                  <IconButton onClick={handlePauseResume} disabled={loading}>
                    {session.status === 'running' ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>

          {/* Progress Bar */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">
                Progress: {session.progress.processedUrls} / {session.progress.totalUrls} URLs
              </Typography>
              <Typography variant="body2">
                {getProgressPercentage()}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={getProgressPercentage()}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {/* Quick Stats */}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <StatusCard
                title="Processed"
                value={session.progress.processedUrls}
                color="primary"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatusCard
                title="Failed"
                value={session.progress.failedUrls}
                color="error"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatusCard
                title="Critical Issues"
                value={criticalIssues}
                color="error"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatusCard
                title="High Issues"
                value={highIssues}
                color="warning"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Charts and Tables */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <ProgressChart session={session} results={results} />
        </Grid>
        
        <Grid item xs={12} lg={6}>
          <IssuesTable results={results} />
        </Grid>
        
        <Grid item xs={12}>
          <ResultsTable results={results} sessionId={session.id} />
        </Grid>
      </Grid>
    </Box>
  );
};
import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { CrawlSession, CrawlConfig } from '@enterprise-web-crawler/shared';
import { apiService } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { CrawlForm } from '../components/CrawlForm/CrawlForm';
import { SessionList } from '../components/SessionList/SessionList';
import { Dashboard } from '../components/Dashboard/Dashboard';

export const HomePage: React.FC = () => {
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CrawlSession | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { isConnected, subscribe } = useWebSocket();

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Set up WebSocket subscriptions
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribers = [
      subscribe('session:created', (session) => {
        setSessions(prev => [session, ...prev]);
        setSuccess(`Crawl session "${session.name}" created successfully`);
      }),

      subscribe('session:updated', (session) => {
        setSessions(prev => prev.map(s => s.id === session.id ? session : s));
        if (selectedSession?.id === session.id) {
          setSelectedSession(session);
        }
      }),

      subscribe('session:completed', (session) => {
        setSessions(prev => prev.map(s => s.id === session.id ? session : s));
        if (selectedSession?.id === session.id) {
          setSelectedSession(session);
        }
        setSuccess(`Crawl session "${session.name}" completed`);
      }),

      subscribe('session:failed', (data) => {
        setError(`Crawl session failed: ${data.error}`);
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [isConnected, subscribe, selectedSession]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const sessionsData = await apiService.getCrawlSessions();
      setSessions(sessionsData.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (config: CrawlConfig & { name: string }) => {
    try {
      setLoading(true);
      const session = await apiService.createCrawlSession(config);
      setShowCreateForm(false);
      setSelectedSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionSelect = (session: CrawlSession) => {
    setSelectedSession(session);
  };

  const handleSessionDelete = async (sessionId: string) => {
    try {
      setLoading(true);
      await apiService.deleteCrawlSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
      setSuccess('Session deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionPause = async (sessionId: string) => {
    try {
      setLoading(true);
      await apiService.pauseCrawlSession(sessionId);
      setSuccess('Session paused');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause session');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionResume = async (sessionId: string) => {
    try {
      setLoading(true);
      await apiService.resumeCrawlSession(sessionId);
      setSuccess('Session resumed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionExport = async (sessionId: string, format: 'pdf' | 'csv') => {
    try {
      setLoading(true);
      const blob = format === 'pdf' 
        ? await apiService.exportToPDF(sessionId)
        : await apiService.exportToCSV(sessionId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `crawl-results-${sessionId}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccess(`Report exported as ${format.toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedSession(null);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {selectedSession ? selectedSession.name : 'Web Crawler Dashboard'}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {selectedSession 
              ? 'Monitor your crawl session progress and results'
              : 'Manage your web crawling sessions and analyze results'
            }
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          {selectedSession && (
            <Button
              variant="outlined"
              onClick={handleBackToList}
            >
              Back to Sessions
            </Button>
          )}
          
          {!selectedSession && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowCreateForm(true)}
              disabled={loading}
            >
              New Crawl Session
            </Button>
          )}
        </Box>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Real-time updates are currently unavailable. Some features may be limited.
        </Alert>
      )}

      {/* Main Content */}
      {selectedSession ? (
        <Dashboard 
          session={selectedSession} 
          onSessionUpdate={setSelectedSession}
        />
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <SessionList
              sessions={sessions}
              onSessionSelect={handleSessionSelect}
              onSessionDelete={handleSessionDelete}
              onSessionPause={handleSessionPause}
              onSessionResume={handleSessionResume}
              onSessionExport={handleSessionExport}
              loading={loading}
            />
          </Grid>
        </Grid>
      )}

      {/* Create Session Dialog */}
      <Dialog
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create New Crawl Session</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <CrawlForm
              onSubmit={handleCreateSession}
              loading={loading}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateForm(false)}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notifications */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
      >
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
};
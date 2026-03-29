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
  Card,
  CardContent,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { apiService } from '../services/api';

interface SimpleCrawlSession {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  progress?: {
    totalUrls: number;
    processedUrls: number;
    failedUrls: number;
  };
}

interface CrawlConfig {
  name: string;
  urls: string[];
  maxDepth?: number;
  concurrency?: number;
  respectRobots?: boolean;
}

export const SimpleHomePage: React.FC = () => {
  const [sessions, setSessions] = useState<SimpleCrawlSession[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<CrawlConfig>({
    name: '',
    urls: [''],
    maxDepth: 3,
    concurrency: 5,
    respectRobots: true,
  });

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const sessionsData = await apiService.getCrawlSessions();
      setSessions(sessionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      setLoading(true);
      
      // Validate form
      if (!formData.name.trim()) {
        setError('Session name is required');
        return;
      }
      
      if (!formData.urls[0]?.trim()) {
        setError('At least one URL is required');
        return;
      }

      const session = await apiService.createCrawlSession(formData);
      setShowCreateForm(false);
      setSuccess(`Crawl session "${session.name}" created successfully`);
      
      // Reset form
      setFormData({
        name: '',
        urls: [''],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true,
      });
      
      // Reload sessions
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...formData.urls];
    newUrls[index] = value;
    setFormData({ ...formData, urls: newUrls });
  };

  const addUrlField = () => {
    setFormData({ ...formData, urls: [...formData.urls, ''] });
  };

  const removeUrlField = (index: number) => {
    if (formData.urls.length > 1) {
      const newUrls = formData.urls.filter((_, i) => i !== index);
      setFormData({ ...formData, urls: newUrls });
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Enterprise Web Crawler
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your web crawling sessions and analyze accessibility results
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadSessions}
            disabled={loading}
          >
            Refresh
          </Button>
          
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
          >
            New Crawl Session
          </Button>
        </Box>
      </Box>

      {/* Sessions List */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Crawl Sessions
              </Typography>
              
              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              )}
              
              {!loading && sessions.length === 0 && (
                <Box sx={{ textAlign: 'center', p: 3 }}>
                  <Typography color="text.secondary">
                    No crawl sessions found. Create your first session to get started.
                  </Typography>
                </Box>
              )}
              
              {!loading && sessions.length > 0 && (
                <Grid container spacing={2}>
                  {sessions.map((session) => (
                    <Grid item xs={12} md={6} lg={4} key={session.id}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {session.name}
                          </Typography>
                          <Typography color="text.secondary" gutterBottom>
                            Status: {session.status}
                          </Typography>
                          <Typography variant="body2">
                            Created: {new Date(session.createdAt).toLocaleDateString()}
                          </Typography>
                          {session.progress && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Progress: {session.progress.processedUrls}/{session.progress.totalUrls} URLs
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Session Dialog */}
      <Dialog
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create New Crawl Session</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  Session Name
                </Typography>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter session name"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  URLs to Crawl
                </Typography>
                {formData.urls.map((url, index) => (
                  <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => handleUrlChange(index, e.target.value)}
                      placeholder="https://example.com"
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        fontSize: '16px'
                      }}
                    />
                    {formData.urls.length > 1 && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => removeUrlField(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                ))}
                <Button
                  variant="outlined"
                  onClick={addUrlField}
                  sx={{ mt: 1 }}
                >
                  Add URL
                </Button>
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Max Depth
                </Typography>
                <input
                  type="number"
                  value={formData.maxDepth}
                  onChange={(e) => setFormData({ ...formData, maxDepth: parseInt(e.target.value) || 3 })}
                  min="1"
                  max="10"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </Grid>
              
              <Grid item xs={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Concurrency
                </Typography>
                <input
                  type="number"
                  value={formData.concurrency}
                  onChange={(e) => setFormData({ ...formData, concurrency: parseInt(e.target.value) || 5 })}
                  min="1"
                  max="20"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    fontSize: '16px'
                  }}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateForm(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateSession}
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Session'}
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
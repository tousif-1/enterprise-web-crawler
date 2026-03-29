import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Typography,
  Box,
  Menu,
  MenuItem,
  Tooltip,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  GetApp as ExportIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { CrawlSession } from '@enterprise-web-crawler/shared';
import { format } from 'date-fns';

interface SessionListProps {
  sessions: CrawlSession[];
  onSessionSelect: (session: CrawlSession) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionPause: (sessionId: string) => void;
  onSessionResume: (sessionId: string) => void;
  onSessionExport: (sessionId: string, format: 'pdf' | 'csv') => void;
  loading?: boolean;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onSessionSelect,
  onSessionDelete,
  onSessionPause,
  onSessionResume,
  onSessionExport,
  loading = false,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedSession, setSelectedSession] = useState<CrawlSession | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, session: CrawlSession) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedSession(session);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedSession(null);
  };

  const handleMenuAction = (action: string) => {
    if (!selectedSession) return;

    switch (action) {
      case 'view':
        onSessionSelect(selectedSession);
        break;
      case 'pause':
        onSessionPause(selectedSession.id);
        break;
      case 'resume':
        onSessionResume(selectedSession.id);
        break;
      case 'delete':
        onSessionDelete(selectedSession.id);
        break;
      case 'export-pdf':
        onSessionExport(selectedSession.id, 'pdf');
        break;
      case 'export-csv':
        onSessionExport(selectedSession.id, 'csv');
        break;
    }
    
    handleMenuClose();
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

  const getProgressPercentage = (session: CrawlSession) => {
    if (session.progress.totalUrls === 0) return 0;
    return Math.round((session.progress.processedUrls / session.progress.totalUrls) * 100);
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime ? new Date(endTime) : new Date();
    const start = new Date(startTime);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  };

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader title="Crawl Sessions" />
        <CardContent>
          <Alert severity="info">
            No crawl sessions found. Create a new session to get started.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        title="Crawl Sessions" 
        subheader={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
      />
      <CardContent sx={{ p: 0 }}>
        <List>
          {sessions.map((session, index) => (
            <ListItem
              key={session.id}
              button
              onClick={() => onSessionSelect(session)}
              divider={index < sessions.length - 1}
              sx={{
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                      {session.name}
                    </Typography>
                    <Chip
                      label={session.status.toUpperCase()}
                      color={getStatusColor(session.status)}
                      size="small"
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Started: {format(new Date(session.startTime), 'MMM dd, yyyy HH:mm')}
                      {session.endTime && (
                        <> • Duration: {formatDuration(session.startTime, session.endTime)}</>
                      )}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {session.progress.processedUrls} / {session.progress.totalUrls} URLs
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {getProgressPercentage(session)}%
                      </Typography>
                    </Box>
                    
                    {session.status === 'running' && (
                      <LinearProgress
                        variant="determinate"
                        value={getProgressPercentage(session)}
                        sx={{ height: 4, borderRadius: 2 }}
                      />
                    )}
                    
                    {session.progress.failedUrls > 0 && (
                      <Typography variant="body2" color="error.main" sx={{ mt: 0.5 }}>
                        {session.progress.failedUrls} failed URLs
                      </Typography>
                    )}
                  </Box>
                }
              />
              
              <ListItemSecondaryAction>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {session.status === 'running' && (
                    <Tooltip title="Pause">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSessionPause(session.id);
                        }}
                        disabled={loading}
                      >
                        <PauseIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  {session.status === 'paused' && (
                    <Tooltip title="Resume">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSessionResume(session.id);
                        }}
                        disabled={loading}
                      >
                        <PlayIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  <Tooltip title="More actions">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, session)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          <MenuItem onClick={() => handleMenuAction('view')}>
            <ViewIcon sx={{ mr: 1 }} fontSize="small" />
            View Details
          </MenuItem>
          
          {selectedSession?.status === 'running' && (
            <MenuItem onClick={() => handleMenuAction('pause')}>
              <PauseIcon sx={{ mr: 1 }} fontSize="small" />
              Pause Session
            </MenuItem>
          )}
          
          {selectedSession?.status === 'paused' && (
            <MenuItem onClick={() => handleMenuAction('resume')}>
              <PlayIcon sx={{ mr: 1 }} fontSize="small" />
              Resume Session
            </MenuItem>
          )}
          
          {(selectedSession?.status === 'completed' || selectedSession?.status === 'paused') && (
            <>
              <MenuItem onClick={() => handleMenuAction('export-pdf')}>
                <ExportIcon sx={{ mr: 1 }} fontSize="small" />
                Export PDF
              </MenuItem>
              <MenuItem onClick={() => handleMenuAction('export-csv')}>
                <ExportIcon sx={{ mr: 1 }} fontSize="small" />
                Export CSV
              </MenuItem>
            </>
          )}
          
          <MenuItem 
            onClick={() => handleMenuAction('delete')}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            Delete Session
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
};
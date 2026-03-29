import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  FormGroup,
  Typography,
  Box,
  Alert,
  CircularProgress
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { apiService } from '../../services/api';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName: string;
}

interface ExportOptions {
  format: 'csv' | 'html' | 'pdf';
  includeDetails: boolean;
  includeTrends: boolean;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  sessionId,
  sessionName
}) => {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'csv',
    includeDetails: true,
    includeTrends: true
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);

      const response = await apiService.post('/reports/export', {
        sessionId,
        format: options.format,
        options: {
          includeDetails: options.includeDetails,
          includeTrends: options.includeTrends,
          format: options.includeDetails ? 'detailed' : 'summary'
        }
      }, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const extension = options.format === 'pdf' ? 'html' : options.format; // PDF returns HTML for now
      link.setAttribute('download', `${sessionName}-report-${timestamp}.${extension}`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onClose();

    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleFormatChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOptions(prev => ({
      ...prev,
      format: event.target.value as 'csv' | 'html' | 'pdf'
    }));
  };

  const handleOptionChange = (option: keyof Omit<ExportOptions, 'format'>) => {
    setOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const getFormatDescription = (format: string) => {
    switch (format) {
      case 'csv':
        return 'Comma-separated values file, ideal for spreadsheet analysis';
      case 'html':
        return 'Web page format with charts and styling, good for sharing';
      case 'pdf':
        return 'Portable document format (currently exports as HTML)';
      default:
        return '';
    }
  };

  const getEstimatedSize = () => {
    let size = 'Small';
    if (options.includeDetails && options.includeTrends) {
      size = 'Large';
    } else if (options.includeDetails || options.includeTrends) {
      size = 'Medium';
    }
    return size;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Export Report
      </DialogTitle>
      
      <DialogContent>
        <Box mb={3}>
          <Typography variant="body2" color="text.secondary">
            Export report for: <strong>{sessionName}</strong>
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Format Selection */}
        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">Export Format</FormLabel>
          <RadioGroup
            value={options.format}
            onChange={handleFormatChange}
          >
            <FormControlLabel 
              value="csv" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2">CSV</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getFormatDescription('csv')}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="html" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2">HTML</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getFormatDescription('html')}
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="pdf" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body2">PDF</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getFormatDescription('pdf')}
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Export Options */}
        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">Include in Export</FormLabel>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={options.includeDetails}
                  onChange={() => handleOptionChange('includeDetails')}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Detailed Results</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Include individual URL results and issue details
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={options.includeTrends}
                  onChange={() => handleOptionChange('includeTrends')}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Trend Analysis</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Include comparison with previous sessions
                  </Typography>
                </Box>
              }
            />
          </FormGroup>
        </FormControl>

        {/* Export Info */}
        <Box 
          sx={{ 
            bgcolor: 'grey.50', 
            p: 2, 
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'grey.200'
          }}
        >
          <Typography variant="body2" gutterBottom>
            <strong>Export Summary:</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Format: {options.format.toUpperCase()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Estimated size: {getEstimatedSize()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Content: {[
              'Summary statistics',
              options.includeDetails && 'Detailed results',
              options.includeTrends && 'Trend analysis'
            ].filter(Boolean).join(', ')}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={exporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          startIcon={exporting ? <CircularProgress size={20} /> : <DownloadIcon />}
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Help as HelpIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { CrawlConfig } from '@enterprise-web-crawler/shared';

interface CrawlFormProps {
  onSubmit: (config: CrawlConfig & { name: string }) => void;
  loading?: boolean;
}

interface FormData {
  name: string;
  urls: string[];
  excludePaths: string[];
  maxDepth: number;
  concurrency: number;
  respectRobots: boolean;
}

interface PatternValidation {
  pattern: string;
  valid: boolean;
  error?: string;
  type?: string;
}

const initialFormData: FormData = {
  name: '',
  urls: [''],
  excludePaths: [],
  maxDepth: 3,
  concurrency: 5,
  respectRobots: true,
};

export const CrawlForm: React.FC<CrawlFormProps> = ({ onSubmit, loading = false }) => {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [newExcludePath, setNewExcludePath] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [patternValidations, setPatternValidations] = useState<PatternValidation[]>([]);
  const [showPatternHelp, setShowPatternHelp] = useState(false);

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Crawl session name is required';
    }

    const validUrls = formData.urls.filter(url => url.trim());
    if (validUrls.length === 0) {
      newErrors.urls = 'At least one valid URL is required';
    } else {
      const invalidUrls = validUrls.filter(url => !validateUrl(url));
      if (invalidUrls.length > 0) {
        newErrors.urls = `Invalid URLs: ${invalidUrls.join(', ')}`;
      }
    }

    if (formData.maxDepth < 1 || formData.maxDepth > 10) {
      newErrors.maxDepth = 'Max depth must be between 1 and 10';
    }

    if (formData.concurrency < 1 || formData.concurrency > 20) {
      newErrors.concurrency = 'Concurrency must be between 1 and 20';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const validUrls = formData.urls.filter(url => url.trim());
    
    onSubmit({
      name: formData.name.trim(),
      urls: validUrls,
      excludePaths: formData.excludePaths,
      maxDepth: formData.maxDepth,
      concurrency: formData.concurrency,
      respectRobots: formData.respectRobots,
    });
  };

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...formData.urls];
    newUrls[index] = value;
    setFormData({ ...formData, urls: newUrls });
  };

  const addUrl = () => {
    setFormData({ ...formData, urls: [...formData.urls, ''] });
  };

  const removeUrl = (index: number) => {
    if (formData.urls.length > 1) {
      const newUrls = formData.urls.filter((_, i) => i !== index);
      setFormData({ ...formData, urls: newUrls });
    }
  };

  const validatePattern = (pattern: string): PatternValidation => {
    // Basic client-side validation
    if (!pattern.trim()) {
      return { pattern, valid: false, error: 'Pattern cannot be empty' };
    }

    // Check for regex pattern
    if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
      try {
        new RegExp(pattern.slice(1, -1));
        return { pattern, valid: true, type: 'regex' };
      } catch (error) {
        return { pattern, valid: false, error: 'Invalid regular expression' };
      }
    }

    // Check for glob patterns
    if (pattern.includes('*') || pattern.includes('?')) {
      return { pattern, valid: true, type: 'glob' };
    }

    // Default to prefix pattern
    return { pattern, valid: true, type: 'prefix' };
  };

  const addExcludePath = () => {
    const trimmedPath = newExcludePath.trim();
    if (trimmedPath && !formData.excludePaths.includes(trimmedPath)) {
      const validation = validatePattern(trimmedPath);
      
      const newPaths = [...formData.excludePaths, trimmedPath];
      const newValidations = [...patternValidations, validation];
      
      setFormData({
        ...formData,
        excludePaths: newPaths,
      });
      setPatternValidations(newValidations);
      setNewExcludePath('');
    }
  };

  const removeExcludePath = (path: string) => {
    const pathIndex = formData.excludePaths.indexOf(path);
    const newPaths = formData.excludePaths.filter(p => p !== path);
    const newValidations = patternValidations.filter((_, index) => index !== pathIndex);
    
    setFormData({
      ...formData,
      excludePaths: newPaths,
    });
    setPatternValidations(newValidations);
  };

  const getPatternTypeDescription = (type?: string): string => {
    switch (type) {
      case 'regex':
        return 'Regular expression';
      case 'glob':
        return 'Glob pattern (* and ?)';
      case 'prefix':
        return 'Starts with';
      default:
        return 'Pattern';
    }
  };

  return (
    <Card>
      <CardHeader
        title="Start New Crawl"
        subheader="Configure your web crawling session"
      />
      <CardContent>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Grid container spacing={3}>
            {/* Session Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Session Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={!!errors.name}
                helperText={errors.name || 'Give your crawl session a descriptive name'}
                required
              />
            </Grid>

            {/* URLs */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                URLs to Crawl *
              </Typography>
              {formData.urls.map((url, index) => (
                <Box key={index} sx={{ display: 'flex', mb: 2, alignItems: 'flex-start' }}>
                  <TextField
                    fullWidth
                    label={`URL ${index + 1}`}
                    value={url}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    error={!!errors.urls}
                    placeholder="https://example.com"
                    sx={{ mr: 1 }}
                  />
                  {formData.urls.length > 1 && (
                    <IconButton
                      onClick={() => removeUrl(index)}
                      color="error"
                      sx={{ mt: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </Box>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={addUrl}
                variant="outlined"
                size="small"
                sx={{ mb: 1 }}
              >
                Add URL
              </Button>
              {errors.urls && (
                <FormHelperText error>{errors.urls}</FormHelperText>
              )}
            </Grid>

            {/* Exclude Paths */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ mb: 0, mr: 1 }}>
                  Exclude Paths
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setShowPatternHelp(!showPatternHelp)}
                  sx={{ color: 'text.secondary' }}
                >
                  <HelpIcon fontSize="small" />
                </IconButton>
              </Box>
              
              {showPatternHelp && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Pattern Types:</strong>
                  </Typography>
                  <Typography variant="body2" component="div">
                    • <strong>Simple paths:</strong> /admin, /support (matches paths starting with pattern)<br/>
                    • <strong>Glob patterns:</strong> *.pdf, /docs/*.html (use * and ? wildcards)<br/>
                    • <strong>Regex patterns:</strong> /^\/api\/v[0-9]+\// (wrap in forward slashes)<br/>
                    • <strong>Examples:</strong> /admin*, */private/*, /.pdf$/, /\/temp\//
                  </Typography>
                </Alert>
              )}

              <Box sx={{ display: 'flex', mb: 2, alignItems: 'flex-start' }}>
                <TextField
                  fullWidth
                  label="Path to exclude"
                  value={newExcludePath}
                  onChange={(e) => setNewExcludePath(e.target.value)}
                  placeholder="/support, /admin*, *.pdf, /^\/api\//"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExcludePath();
                    }
                  }}
                  sx={{ mr: 1 }}
                  helperText={newExcludePath.trim() ? getPatternTypeDescription(validatePattern(newExcludePath).type) : ''}
                />
                <Button
                  onClick={addExcludePath}
                  variant="outlined"
                  disabled={!newExcludePath.trim()}
                  sx={{ mt: 0.5 }}
                >
                  Add
                </Button>
              </Box>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                {formData.excludePaths.map((path, index) => {
                  const validation = patternValidations[index];
                  return (
                    <Chip
                      key={path}
                      label={path}
                      onDelete={() => removeExcludePath(path)}
                      variant="outlined"
                      color={validation?.valid === false ? 'error' : 'default'}
                      icon={validation?.valid === false ? <ErrorIcon /> : <CheckCircleIcon />}
                      sx={{
                        '& .MuiChip-icon': {
                          color: validation?.valid === false ? 'error.main' : 'success.main'
                        }
                      }}
                    />
                  );
                })}
              </Box>
              
              <FormHelperText>
                Specify paths to exclude from crawling. Supports simple paths, glob patterns, and regex.
              </FormHelperText>
            </Grid>

            {/* Advanced Settings */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                Advanced Settings
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Max Depth</InputLabel>
                <Select
                  value={formData.maxDepth}
                  label="Max Depth"
                  onChange={(e) => setFormData({ ...formData, maxDepth: Number(e.target.value) })}
                  error={!!errors.maxDepth}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((depth) => (
                    <MenuItem key={depth} value={depth}>
                      {depth} level{depth > 1 ? 's' : ''}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText error={!!errors.maxDepth}>
                  {errors.maxDepth || 'Maximum depth to crawl from starting URLs'}
                </FormHelperText>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Concurrency</InputLabel>
                <Select
                  value={formData.concurrency}
                  label="Concurrency"
                  onChange={(e) => setFormData({ ...formData, concurrency: Number(e.target.value) })}
                  error={!!errors.concurrency}
                >
                  {[1, 2, 3, 5, 8, 10, 15, 20].map((concurrency) => (
                    <MenuItem key={concurrency} value={concurrency}>
                      {concurrency} concurrent request{concurrency > 1 ? 's' : ''}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText error={!!errors.concurrency}>
                  {errors.concurrency || 'Number of simultaneous requests'}
                </FormHelperText>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.respectRobots}
                    onChange={(e) => setFormData({ ...formData, respectRobots: e.target.checked })}
                  />
                }
                label="Respect robots.txt"
              />
              <FormHelperText>
                Follow robots.txt directives when crawling
              </FormHelperText>
            </Grid>

            {/* Submit Button */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={<PlayIcon />}
                  disabled={loading}
                  sx={{ minWidth: 150 }}
                >
                  {loading ? 'Starting...' : 'Start Crawl'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  );
};
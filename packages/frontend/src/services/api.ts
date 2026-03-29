import axios from 'axios';
import { CrawlSession, CrawlResult, CrawlConfig, SearchQuery, SearchResult } from '@enterprise-web-crawler/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens if needed
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // Crawl Session endpoints
  async createCrawlSession(config: CrawlConfig & { name: string }): Promise<CrawlSession> {
    const response = await api.post('/api/crawl-sessions', config);
    return response.data;
  },

  async getCrawlSessions(): Promise<CrawlSession[]> {
    const response = await api.get('/api/crawl-sessions');
    return response.data;
  },

  async getCrawlSession(id: string): Promise<CrawlSession> {
    const response = await api.get(`/api/crawl-sessions/${id}`);
    return response.data;
  },

  async pauseCrawlSession(id: string): Promise<void> {
    await api.post(`/api/crawl-sessions/${id}/pause`);
  },

  async resumeCrawlSession(id: string): Promise<void> {
    await api.post(`/api/crawl-sessions/${id}/resume`);
  },

  async deleteCrawlSession(id: string): Promise<void> {
    await api.delete(`/api/crawl-sessions/${id}`);
  },

  // Crawl Results endpoints
  async getCrawlResults(sessionId: string): Promise<CrawlResult[]> {
    const response = await api.get(`/api/crawl-results?sessionId=${sessionId}`);
    return response.data;
  },

  async getCrawlResult(id: string): Promise<CrawlResult> {
    const response = await api.get(`/api/crawl-results/${id}`);
    return response.data;
  },

  // Search endpoints
  async searchResults(query: SearchQuery): Promise<SearchResult<CrawlResult>> {
    const response = await api.post('/api/search', query);
    return response.data;
  },

  // Export endpoints
  async exportToPDF(sessionId: string): Promise<Blob> {
    const response = await api.get(`/api/crawl-sessions/${sessionId}/export/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async exportToCSV(sessionId: string): Promise<Blob> {
    const response = await api.get(`/api/crawl-sessions/${sessionId}/export/csv`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await api.get('/api/health');
    return response.data;
  },
};

export default api;
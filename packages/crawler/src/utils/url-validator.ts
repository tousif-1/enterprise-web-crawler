import { URL } from 'url';

export class URLValidator {
  private readonly allowedProtocols = ['http:', 'https:'];
  private readonly blockedDomains = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0'
  ];

  isValid(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Check protocol
      if (!this.allowedProtocols.includes(parsedUrl.protocol)) {
        return false;
      }

      // Basic URL structure validation
      if (!parsedUrl.hostname || parsedUrl.hostname.length === 0 || parsedUrl.hostname === '.com') {
        return false;
      }

      // Check for blocked domains (optional security measure)
      if (this.blockedDomains.includes(parsedUrl.hostname)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  normalize(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // Remove fragment
      parsedUrl.hash = '';
      
      // Sort query parameters for consistency
      const params = new URLSearchParams(parsedUrl.search);
      const sortedParams = new URLSearchParams();
      
      const uniqueKeys = Array.from(new Set(params.keys())).sort();
      uniqueKeys.forEach(key => {
        params.getAll(key).forEach(value => {
          sortedParams.append(key, value);
        });
      });
      
      parsedUrl.search = sortedParams.toString();
      
      return parsedUrl.toString();
    } catch (error) {
      return url;
    }
  }

  getDomain(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch (error) {
      return null;
    }
  }

  isSameDomain(url1: string, url2: string): boolean {
    const domain1 = this.getDomain(url1);
    const domain2 = this.getDomain(url2);
    
    return domain1 !== null && domain2 !== null && domain1 === domain2;
  }
}
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { Link } from '@enterprise-web-crawler/shared';

export class LinkExtractor {
  extractLinks(html: string, baseUrl: string): Link[] {
    const $ = cheerio.load(html);
    const links: Link[] = [];
    const seenUrls = new Set<string>();

    // Extract links from anchor tags
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();
      
      if (href) {
        const link = this.createLink(href, baseUrl, text, 'a');
        if (link && !seenUrls.has(link.url)) {
          links.push(link);
          seenUrls.add(link.url);
        }
      }
    });

    // Extract links from images
    $('img[src]').each((_, element) => {
      const src = $(element).attr('src');
      const alt = $(element).attr('alt') || '';
      
      if (src) {
        const link = this.createLink(src, baseUrl, alt, 'img');
        if (link && !seenUrls.has(link.url)) {
          links.push(link);
          seenUrls.add(link.url);
        }
      }
    });

    // Extract links from stylesheets
    $('link[rel="stylesheet"][href]').each((_, element) => {
      const href = $(element).attr('href');
      
      if (href) {
        const link = this.createLink(href, baseUrl, 'stylesheet', 'link');
        if (link && !seenUrls.has(link.url)) {
          links.push(link);
          seenUrls.add(link.url);
        }
      }
    });

    // Extract links from scripts
    $('script[src]').each((_, element) => {
      const src = $(element).attr('src');
      
      if (src) {
        const link = this.createLink(src, baseUrl, 'script', 'script');
        if (link && !seenUrls.has(link.url)) {
          links.push(link);
          seenUrls.add(link.url);
        }
      }
    });

    return links;
  }

  private createLink(href: string, baseUrl: string, text: string, elementType: string): Link | null {
    try {
      // Skip empty hrefs, non-HTTP(S) protocols and fragments
      if (!href || href.trim() === '' || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        return null;
      }

      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).toString();
      const baseUrlObj = new URL(baseUrl);
      const linkUrlObj = new URL(absoluteUrl);

      // Determine if link is internal or external
      const isInternal = linkUrlObj.hostname === baseUrlObj.hostname;

      return {
        url: absoluteUrl,
        sourceUrl: baseUrl,
        text: text || href,
        type: isInternal ? 'internal' : 'external',
        status: 'pending'
      };
    } catch (error) {
      // Invalid URL, skip it
      return null;
    }
  }

  // Extract only internal links (for crawling within the same domain)
  extractInternalLinks(html: string, baseUrl: string): Link[] {
    const allLinks = this.extractLinks(html, baseUrl);
    return allLinks.filter(link => link.type === 'internal');
  }

  // Extract only external links (for validation purposes)
  extractExternalLinks(html: string, baseUrl: string): Link[] {
    const allLinks = this.extractLinks(html, baseUrl);
    return allLinks.filter(link => link.type === 'external');
  }

  // Extract links by element type
  extractLinksByType(html: string, baseUrl: string, elementType: 'a' | 'img' | 'link' | 'script'): Link[] {
    const $ = cheerio.load(html);
    const links: Link[] = [];

    switch (elementType) {
      case 'a':
        $('a[href]').each((_, element) => {
          const href = $(element).attr('href');
          const text = $(element).text().trim();
          if (href) {
            const link = this.createLink(href, baseUrl, text, 'a');
            if (link) links.push(link);
          }
        });
        break;

      case 'img':
        $('img[src]').each((_, element) => {
          const src = $(element).attr('src');
          const alt = $(element).attr('alt') || '';
          if (src) {
            const link = this.createLink(src, baseUrl, alt, 'img');
            if (link) links.push(link);
          }
        });
        break;

      case 'link':
        $('link[href]').each((_, element) => {
          const href = $(element).attr('href');
          const rel = $(element).attr('rel') || '';
          if (href) {
            const link = this.createLink(href, baseUrl, rel, 'link');
            if (link) links.push(link);
          }
        });
        break;

      case 'script':
        $('script[src]').each((_, element) => {
          const src = $(element).attr('src');
          if (src) {
            const link = this.createLink(src, baseUrl, 'script', 'script');
            if (link) links.push(link);
          }
        });
        break;
    }

    return links;
  }
}
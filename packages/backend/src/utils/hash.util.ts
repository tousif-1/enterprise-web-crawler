import crypto from 'crypto';
import { ContentHashResult } from '@enterprise-web-crawler/shared';

export class HashUtil {
  /**
   * Generate MD5 hash for content
   */
  static generateMD5(content: string): string {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  /**
   * Generate SHA256 hash for content (more secure alternative)
   */
  static generateSHA256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Compare content hashes to detect changes
   */
  static compareHashes(currentHash: string, previousHash?: string): boolean {
    if (!previousHash) {
      return true; // First time crawling, consider as changed
    }
    return currentHash !== previousHash;
  }

  /**
   * Generate content hash result with change detection
   */
  static generateContentHashResult(
    url: string,
    content: string,
    previousHash?: string
  ): ContentHashResult {
    const currentHash = this.generateMD5(content);
    const hasChanged = this.compareHashes(currentHash, previousHash);

    return {
      url,
      currentHash,
      previousHash,
      hasChanged,
      changeDetectedAt: hasChanged ? new Date() : undefined
    };
  }

  /**
   * Normalize content before hashing (remove whitespace variations, etc.)
   */
  static normalizeContent(content: string): string {
    return content
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/>\s+</g, '><') // Remove whitespace between HTML tags
      .trim()
      .toLowerCase();
  }

  /**
   * Generate normalized content hash
   */
  static generateNormalizedHash(content: string): string {
    const normalizedContent = this.normalizeContent(content);
    return this.generateMD5(normalizedContent);
  }

  /**
   * Extract text content from HTML for hashing
   */
  static extractTextContent(html: string): string {
    // Simple HTML tag removal - in production, consider using a proper HTML parser
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Replace HTML entities with space
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Generate hash for text content only (ignoring HTML structure changes)
   */
  static generateTextContentHash(html: string): string {
    const textContent = this.extractTextContent(html);
    return this.generateMD5(textContent);
  }
}
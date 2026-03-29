import { HashUtil } from '../utils/hash.util';

describe('HashUtil', () => {
  describe('generateMD5', () => {
    it('should generate consistent MD5 hash for same content', () => {
      const content = 'Hello, World!';
      const hash1 = HashUtil.generateMD5(content);
      const hash2 = HashUtil.generateMD5(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(32); // MD5 hash length
    });

    it('should generate different hashes for different content', () => {
      const content1 = 'Hello, World!';
      const content2 = 'Hello, Universe!';
      
      const hash1 = HashUtil.generateMD5(content1);
      const hash2 = HashUtil.generateMD5(content2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = HashUtil.generateMD5('');
      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e'); // Known MD5 of empty string
    });
  });

  describe('generateSHA256', () => {
    it('should generate consistent SHA256 hash for same content', () => {
      const content = 'Hello, World!';
      const hash1 = HashUtil.generateSHA256(content);
      const hash2 = HashUtil.generateSHA256(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hash length
    });

    it('should generate different hashes for different content', () => {
      const content1 = 'Hello, World!';
      const content2 = 'Hello, Universe!';
      
      const hash1 = HashUtil.generateSHA256(content1);
      const hash2 = HashUtil.generateSHA256(content2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('compareHashes', () => {
    it('should return true when hashes are different', () => {
      const hash1 = 'abc123';
      const hash2 = 'def456';
      
      expect(HashUtil.compareHashes(hash1, hash2)).toBe(true);
    });

    it('should return false when hashes are the same', () => {
      const hash1 = 'abc123';
      const hash2 = 'abc123';
      
      expect(HashUtil.compareHashes(hash1, hash2)).toBe(false);
    });

    it('should return true when previous hash is undefined (first time)', () => {
      const hash1 = 'abc123';
      
      expect(HashUtil.compareHashes(hash1, undefined)).toBe(true);
    });
  });

  describe('generateContentHashResult', () => {
    it('should detect content change when hashes differ', () => {
      const url = 'https://example.com';
      const content = 'New content';
      const previousHash = 'old_hash';
      
      const result = HashUtil.generateContentHashResult(url, content, previousHash);
      
      expect(result.url).toBe(url);
      expect(result.currentHash).toBe(HashUtil.generateMD5(content));
      expect(result.previousHash).toBe(previousHash);
      expect(result.hasChanged).toBe(true);
      expect(result.changeDetectedAt).toBeInstanceOf(Date);
    });

    it('should not detect change when hashes are the same', () => {
      const url = 'https://example.com';
      const content = 'Same content';
      const currentHash = HashUtil.generateMD5(content);
      
      const result = HashUtil.generateContentHashResult(url, content, currentHash);
      
      expect(result.hasChanged).toBe(false);
      expect(result.changeDetectedAt).toBeUndefined();
    });

    it('should detect change for first-time crawling (no previous hash)', () => {
      const url = 'https://example.com';
      const content = 'First time content';
      
      const result = HashUtil.generateContentHashResult(url, content);
      
      expect(result.hasChanged).toBe(true);
      expect(result.previousHash).toBeUndefined();
      expect(result.changeDetectedAt).toBeInstanceOf(Date);
    });
  });

  describe('normalizeContent', () => {
    it('should normalize whitespace', () => {
      const content = '  Hello    World  \n\t  ';
      const normalized = HashUtil.normalizeContent(content);
      
      expect(normalized).toBe('hello world');
    });

    it('should remove whitespace between HTML tags', () => {
      const content = '<div>  <p>  Hello  </p>  </div>';
      const normalized = HashUtil.normalizeContent(content);
      
      expect(normalized).toBe('<div><p> hello </p></div>');
    });

    it('should convert to lowercase', () => {
      const content = 'Hello WORLD';
      const normalized = HashUtil.normalizeContent(content);
      
      expect(normalized).toBe('hello world');
    });
  });

  describe('generateNormalizedHash', () => {
    it('should generate same hash for content with different whitespace', () => {
      const content1 = 'Hello World';
      const content2 = '  Hello    World  ';
      const content3 = 'hello\n\tworld';
      
      const hash1 = HashUtil.generateNormalizedHash(content1);
      const hash2 = HashUtil.generateNormalizedHash(content2);
      const hash3 = HashUtil.generateNormalizedHash(content3);
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('extractTextContent', () => {
    it('should remove HTML tags', () => {
      const html = '<div><p>Hello <strong>World</strong></p></div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('Hello World');
    });

    it('should remove script tags and content', () => {
      const html = '<div>Content<script>alert("test");</script>More content</div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('ContentMore content');
    });

    it('should remove style tags and content', () => {
      const html = '<div>Content<style>body { color: red; }</style>More content</div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('ContentMore content');
    });

    it('should replace HTML entities with space', () => {
      const html = '<div>Hello&nbsp;World&amp;Universe</div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('Hello World Universe');
    });

    it('should normalize whitespace in extracted text', () => {
      const html = '<div>  Hello  \n\t  World  </div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('Hello World');
    });

    it('should handle empty HTML', () => {
      const html = '<div></div>';
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toBe('');
    });

    it('should handle complex nested HTML', () => {
      const html = `
        <html>
          <head>
            <title>Page Title</title>
            <script>console.log('test');</script>
            <style>body { margin: 0; }</style>
          </head>
          <body>
            <header>
              <h1>Main Title</h1>
              <nav>
                <ul>
                  <li><a href="/home">Home</a></li>
                  <li><a href="/about">About</a></li>
                </ul>
              </nav>
            </header>
            <main>
              <p>This is the main content with <em>emphasis</em> and <strong>strong</strong> text.</p>
              <div class="sidebar">
                <p>Sidebar content</p>
              </div>
            </main>
            <footer>
              <p>&copy; 2023 Company Name</p>
            </footer>
          </body>
        </html>
      `;
      
      const text = HashUtil.extractTextContent(html);
      
      expect(text).toContain('Page Title');
      expect(text).toContain('Main Title');
      expect(text).toContain('Home');
      expect(text).toContain('About');
      expect(text).toContain('This is the main content');
      expect(text).toContain('emphasis');
      expect(text).toContain('strong');
      expect(text).toContain('Sidebar content');
      expect(text).toContain('2023 Company Name');
      expect(text).not.toContain('console.log');
      expect(text).not.toContain('margin: 0');
      expect(text).not.toContain('<');
      expect(text).not.toContain('>');
    });
  });

  describe('generateTextContentHash', () => {
    it('should generate hash based on text content only', () => {
      const html1 = '<div><p>Hello World</p></div>';
      const html2 = '<span><strong>Hello World</strong></span>';
      
      const hash1 = HashUtil.generateTextContentHash(html1);
      const hash2 = HashUtil.generateTextContentHash(html2);
      
      expect(hash1).toBe(hash2); // Same text content, different HTML structure
    });

    it('should generate different hashes for different text content', () => {
      const html1 = '<div>Hello World</div>';
      const html2 = '<div>Hello Universe</div>';
      
      const hash1 = HashUtil.generateTextContentHash(html1);
      const hash2 = HashUtil.generateTextContentHash(html2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should ignore script and style content in hash generation', () => {
      const html1 = '<div>Content</div>';
      const html2 = '<div>Content<script>alert("test");</script><style>body{color:red;}</style></div>';
      
      const hash1 = HashUtil.generateTextContentHash(html1);
      const hash2 = HashUtil.generateTextContentHash(html2);
      
      expect(hash1).toBe(hash2);
    });
  });
});
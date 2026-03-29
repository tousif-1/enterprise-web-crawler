import { LinkExtractor } from '../utils/link-extractor';

describe('LinkExtractor', () => {
  let extractor: LinkExtractor;

  beforeEach(() => {
    extractor = new LinkExtractor();
  });

  describe('extractLinks', () => {
    it('should extract anchor links', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page1">Page 1</a>
            <a href="/relative-page">Relative Page</a>
            <a href="#fragment">Fragment</a>
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(2); // Fragment links are skipped
      expect(links[0].url).toBe('https://example.com/page1');
      expect(links[0].text).toBe('Page 1');
      expect(links[0].type).toBe('internal');
      
      expect(links[1].url).toBe('https://example.com/relative-page');
      expect(links[1].text).toBe('Relative Page');
      expect(links[1].type).toBe('internal');
    });

    it('should extract image links', () => {
      const html = `
        <html>
          <body>
            <img src="https://example.com/image1.jpg" alt="Image 1">
            <img src="/relative-image.png" alt="Relative Image">
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/image1.jpg');
      expect(links[0].text).toBe('Image 1');
      
      expect(links[1].url).toBe('https://example.com/relative-image.png');
      expect(links[1].text).toBe('Relative Image');
    });

    it('should extract stylesheet links', () => {
      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="https://example.com/styles.css">
            <link rel="stylesheet" href="/local-styles.css">
          </head>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/styles.css');
      expect(links[0].text).toBe('stylesheet');
      
      expect(links[1].url).toBe('https://example.com/local-styles.css');
      expect(links[1].text).toBe('stylesheet');
    });

    it('should extract script links', () => {
      const html = `
        <html>
          <head>
            <script src="https://example.com/script.js"></script>
            <script src="/local-script.js"></script>
          </head>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/script.js');
      expect(links[0].text).toBe('script');
      
      expect(links[1].url).toBe('https://example.com/local-script.js');
      expect(links[1].text).toBe('script');
    });

    it('should skip invalid protocols', () => {
      const html = `
        <html>
          <body>
            <a href="mailto:test@example.com">Email</a>
            <a href="tel:+1234567890">Phone</a>
            <a href="javascript:alert('test')">JavaScript</a>
            <a href="#fragment">Fragment</a>
            <a href="https://example.com/valid">Valid Link</a>
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/valid');
    });

    it('should deduplicate links', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/page">Page</a>
            <a href="https://example.com/page">Same Page</a>
            <img src="https://example.com/page" alt="Same URL as image">
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/page');
    });

    it('should handle malformed HTML gracefully', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/valid">Valid</a>
            <a href="">Empty href</a>
            <a>No href</a>
            <img src=""><!-- Empty src -->
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/valid');
    });
  });

  describe('extractInternalLinks', () => {
    it('should extract only internal links', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/internal">Internal</a>
            <a href="https://other.com/external">External</a>
            <a href="/relative">Relative</a>
          </body>
        </html>
      `;

      const links = extractor.extractInternalLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/internal');
      expect(links[1].url).toBe('https://example.com/relative');
      expect(links.every(link => link.type === 'internal')).toBe(true);
    });
  });

  describe('extractExternalLinks', () => {
    it('should extract only external links', () => {
      const html = `
        <html>
          <body>
            <a href="https://example.com/internal">Internal</a>
            <a href="https://other.com/external">External</a>
            <a href="/relative">Relative</a>
          </body>
        </html>
      `;

      const links = extractor.extractExternalLinks(html, 'https://example.com');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://other.com/external');
      expect(links[0].type).toBe('external');
    });
  });

  describe('extractLinksByType', () => {
    const html = `
      <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <script src="/script.js"></script>
        </head>
        <body>
          <a href="/page">Page</a>
          <img src="/image.jpg" alt="Image">
        </body>
      </html>
    `;

    it('should extract only anchor links', () => {
      const links = extractor.extractLinksByType(html, 'https://example.com', 'a');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/page');
    });

    it('should extract only image links', () => {
      const links = extractor.extractLinksByType(html, 'https://example.com', 'img');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/image.jpg');
    });

    it('should extract only stylesheet links', () => {
      const links = extractor.extractLinksByType(html, 'https://example.com', 'link');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/styles.css');
    });

    it('should extract only script links', () => {
      const links = extractor.extractLinksByType(html, 'https://example.com', 'script');
      
      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/script.js');
    });
  });

  describe('URL resolution', () => {
    it('should resolve relative URLs correctly', () => {
      const html = `
        <html>
          <body>
            <a href="/absolute-path">Absolute Path</a>
            <a href="relative-path">Relative Path</a>
            <a href="../parent-path">Parent Path</a>
            <a href="./current-path">Current Path</a>
          </body>
        </html>
      `;

      const links = extractor.extractLinks(html, 'https://example.com/current/page');
      
      expect(links).toHaveLength(4);
      expect(links[0].url).toBe('https://example.com/absolute-path');
      expect(links[1].url).toBe('https://example.com/current/relative-path');
      expect(links[2].url).toBe('https://example.com/parent-path');
      expect(links[3].url).toBe('https://example.com/current/current-path');
    });
  });
});
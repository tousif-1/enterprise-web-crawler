import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CrawlForm } from '../../components/CrawlForm/CrawlForm';
import { CrawlConfig } from '@enterprise-web-crawler/shared';

describe('CrawlForm - Path Exclusion Features', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  describe('Exclusion Path Management', () => {
    it('should add exclusion paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      await user.type(pathInput, '/admin');
      await user.click(addButton!);

      expect(screen.getByText('/admin')).toBeInTheDocument();
      expect(pathInput).toHaveValue('');
    });

    it('should add multiple exclusion paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      // Add first path
      await user.type(pathInput, '/admin');
      await user.click(addButton!);

      // Add second path
      await user.type(pathInput, '*.pdf');
      await user.click(addButton!);

      // Add third path
      await user.type(pathInput, '/^\/api\//');
      await user.click(addButton!);

      expect(screen.getByText('/admin')).toBeInTheDocument();
      expect(screen.getByText('*.pdf')).toBeInTheDocument();
      expect(screen.getByText('/^\/api\//')).toBeInTheDocument();
    });

    it('should remove exclusion paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      // Add path
      await user.type(pathInput, '/admin');
      await user.click(addButton!);

      expect(screen.getByText('/admin')).toBeInTheDocument();

      // Remove path
      const deleteButton = screen.getByTestId('CancelIcon');
      await user.click(deleteButton);

      expect(screen.queryByText('/admin')).not.toBeInTheDocument();
    });

    it('should prevent duplicate exclusion paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      // Add path twice
      await user.type(pathInput, '/admin');
      await user.click(addButton!);
      await user.type(pathInput, '/admin');
      await user.click(addButton!);

      // Should only appear once
      const adminChips = screen.getAllByText('/admin');
      expect(adminChips).toHaveLength(1);
    });

    it('should handle Enter key to add paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      await user.type(pathInput, '/admin');
      await user.keyboard('{Enter}');

      expect(screen.getByText('/admin')).toBeInTheDocument();
      expect(pathInput).toHaveValue('');
    });

    it('should not add empty or whitespace-only paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      // Try to add empty path
      await user.click(addButton!);
      expect(screen.queryByText('')).not.toBeInTheDocument();

      // Try to add whitespace-only path
      await user.type(pathInput, '   ');
      await user.click(addButton!);
      expect(screen.queryByText('   ')).not.toBeInTheDocument();
    });
  });

  describe('Pattern Type Detection and Display', () => {
    it('should show pattern type for simple paths', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      await user.type(pathInput, '/admin');
      expect(screen.getByText(/starts with/i)).toBeInTheDocument();
    });

    it('should show pattern type for glob patterns', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      await user.type(pathInput, '*.pdf');
      expect(screen.getByText(/ends with/i)).toBeInTheDocument();
    });

    it('should show pattern type for regex patterns', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      await user.type(pathInput, '/^\/api\//');
      expect(screen.getByText(/regular expression/i)).toBeInTheDocument();
    });

    it('should show pattern type for contains patterns', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      await user.type(pathInput, '*private*');
      expect(screen.getByText(/glob pattern/i)).toBeInTheDocument();
    });
  });

  describe('Pattern Validation Visual Indicators', () => {
    it('should show success indicator for valid patterns', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      await user.type(pathInput, '/admin');
      await user.click(addButton!);

      // Check for success icon (CheckCircleIcon)
      expect(screen.getByTestId('CheckCircleIcon')).toBeInTheDocument();
    });

    it('should show error indicator for invalid regex patterns', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      await user.type(pathInput, '/[invalid/');
      await user.click(addButton!);

      // Check for error icon (ErrorIcon)
      expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument();
    });
  });

  describe('Help Documentation', () => {
    it('should toggle pattern help documentation', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const helpButton = screen.getByTestId('HelpIcon');

      // Help should be hidden initially
      expect(screen.queryByText(/Pattern Types:/)).not.toBeInTheDocument();

      // Click to show help
      await user.click(helpButton);
      expect(screen.getByText(/Pattern Types:/)).toBeInTheDocument();
      expect(screen.getByText(/Simple paths:/)).toBeInTheDocument();
      expect(screen.getByText(/Glob patterns:/)).toBeInTheDocument();
      expect(screen.getByText(/Regex patterns:/)).toBeInTheDocument();

      // Click to hide help
      await user.click(helpButton);
      expect(screen.queryByText(/Pattern Types:/)).not.toBeInTheDocument();
    });
  });

  describe('Form Submission with Exclusion Paths', () => {
    it('should include exclusion paths in form submission', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      // Fill required fields
      const nameInput = screen.getByLabelText(/session name/i);
      const urlInput = screen.getByLabelText(/url 1/i);
      
      await user.type(nameInput, 'Test Session');
      await user.type(urlInput, 'https://example.com');

      // Add exclusion paths
      const pathInput = screen.getByLabelText(/path to exclude/i);
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      const addButton = addButtons.find(button => button.textContent === 'Add');

      await user.type(pathInput, '/admin');
      await user.click(addButton!);
      await user.type(pathInput, '*.pdf');
      await user.click(addButton!);

      // Submit form
      const submitButton = screen.getByRole('button', { name: /start crawl/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Session',
          urls: ['https://example.com'],
          excludePaths: ['/admin', '*.pdf'],
          maxDepth: 3,
          concurrency: 5,
          respectRobots: true
        })
      );
    });

    it('should submit with empty exclusion paths if none added', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      // Fill required fields
      const nameInput = screen.getByLabelText(/session name/i);
      const urlInput = screen.getByLabelText(/url 1/i);
      
      await user.type(nameInput, 'Test Session');
      await user.type(urlInput, 'https://example.com');

      // Submit form without adding exclusion paths
      const submitButton = screen.getByRole('button', { name: /start crawl/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          excludePaths: []
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for exclusion path controls', () => {
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      expect(screen.getByLabelText(/path to exclude/i)).toBeInTheDocument();
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      expect(addButtons.find(button => button.textContent === 'Add')).toBeInTheDocument();
    });

    it('should have proper help text for exclusion paths', () => {
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      expect(screen.getByText(/specify paths to exclude from crawling/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation for exclusion path management', async () => {
      const user = userEvent.setup();
      render(<CrawlForm onSubmit={mockOnSubmit} />);

      const pathInput = screen.getByLabelText(/path to exclude/i);

      // Should be able to add path with Enter key
      await user.type(pathInput, '/admin');
      await user.keyboard('{Enter}');

      expect(screen.getByText('/admin')).toBeInTheDocument();
    });
  });
});
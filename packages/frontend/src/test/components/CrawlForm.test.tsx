import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CrawlForm } from '../../components/CrawlForm/CrawlForm';

describe('CrawlForm', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders all form fields', () => {
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText(/session name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max depth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/concurrency/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/respect robots.txt/i)).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /start crawl/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/session name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/at least one valid url is required/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates URL format', async () => {
    const user = userEvent.setup();
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    const nameInput = screen.getByLabelText(/session name/i);
    const urlInput = screen.getByLabelText(/url 1/i);
    const submitButton = screen.getByRole('button', { name: /start crawl/i });

    await user.type(nameInput, 'Test Session');
    await user.type(urlInput, 'invalid-url');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid urls: invalid-url/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits valid form data', async () => {
    const user = userEvent.setup();
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    const nameInput = screen.getByLabelText(/session name/i);
    const urlInput = screen.getByLabelText(/url 1/i);
    const submitButton = screen.getByRole('button', { name: /start crawl/i });

    await user.type(nameInput, 'Test Session');
    await user.type(urlInput, 'https://example.com');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Test Session',
        urls: ['https://example.com'],
        excludePaths: [],
        maxDepth: 3,
        concurrency: 5,
        respectRobots: true,
      });
    });
  });

  it('allows adding and removing URLs', async () => {
    const user = userEvent.setup();
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    // Add a second URL
    const addUrlButton = screen.getByRole('button', { name: /add url/i });
    await user.click(addUrlButton);

    expect(screen.getByLabelText(/url 2/i)).toBeInTheDocument();

    // Remove the first URL (should not be possible when only 2 URLs)
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(2);

    await user.click(deleteButtons[0]);
    expect(screen.queryByLabelText(/url 2/i)).not.toBeInTheDocument();
  });

  it('allows adding and removing exclude paths', async () => {
    const user = userEvent.setup();
    render(<CrawlForm onSubmit={mockOnSubmit} />);

    const excludePathInput = screen.getByLabelText(/path to exclude/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    await user.type(excludePathInput, '/admin');
    await user.click(addButton);

    expect(screen.getByText('/admin')).toBeInTheDocument();

    // Remove the exclude path
    const deleteChipButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteChipButton);

    expect(screen.queryByText('/admin')).not.toBeInTheDocument();
  });
});
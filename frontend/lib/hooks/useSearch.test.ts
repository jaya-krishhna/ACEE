/**
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSearch } from './useSearch';
import * as searchApi from '@/lib/api/search';

// Mock the searchEvents API module
jest.mock('@/lib/api/search');

describe('useSearch Hook', () => {
  const mockSearchEvents = searchApi.searchEvents as jest.MockedFunction<
    typeof searchApi.searchEvents
  >;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('debounces query input changes by 400ms before calling API', async () => {
    mockSearchEvents.mockResolvedValue({
      results: [
        {
          id: '1',
          slug: 'ai-hackathon',
          title: 'AI Hackathon',
          tagline: 'Build AI apps',
          event_type: 'hackathon',
          banner_image_url: null,
          organization: { name: 'TechOrg' },
          location: 'Bengaluru',
          event_start_at: '2026-10-01T10:00:00Z',
          registration_close_at: null,
          is_paid: false,
          registration_fee: 0,
          prize_summary_text: '$10k',
          organizer: 'TechOrg',
          category: 'hackathon',
          description: 'Build AI apps',
          starts_at: '2026-10-01T10:00:00Z',
          register_by: null,
          fee: 0,
          currency: 'INR',
          tags: ['AI'],
          score: 1.0,
        },
      ],
      total: 1,
      query_interpreted: 'AI Hackathons',
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const { result } = renderHook(() => useSearch({ debounceMs: 400 }));

    // Type query
    act(() => {
      result.current.setQuery('AI hackathon');
    });

    // Should NOT call API immediately before 400ms
    expect(mockSearchEvents).not.toHaveBeenCalled();

    // Fast-forward time by 399ms
    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(mockSearchEvents).not.toHaveBeenCalled();

    // Fast-forward remaining 1ms (total 400ms)
    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(mockSearchEvents).toHaveBeenCalledTimes(1);
    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'AI hackathon',
      }),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
  });

  test('cancels in-flight requests when a newer keystroke fires', async () => {
    let abortSignalCaptured: AbortSignal | undefined;

    mockSearchEvents.mockImplementation(async (_params, options) => {
      abortSignalCaptured = options?.signal;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            results: [],
            total: 0,
            query_interpreted: null,
            page: 1,
            limit: 20,
            totalPages: 0,
          });
        }, 1000);
      });
    });

    const { result } = renderHook(() => useSearch({ debounceMs: 400 }));

    // First keystroke
    act(() => {
      result.current.setQuery('hack');
    });

    // Advance 400ms to trigger first request
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockSearchEvents).toHaveBeenCalledTimes(1);
    const firstSignal = abortSignalCaptured;
    expect(firstSignal?.aborted).toBe(false);

    // Second keystroke before first request resolves
    act(() => {
      result.current.setQuery('hackathon');
    });

    // Advance 400ms to trigger second request
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockSearchEvents).toHaveBeenCalledTimes(2);
    // Verify first request signal was aborted
    expect(firstSignal?.aborted).toBe(true);
  });
});

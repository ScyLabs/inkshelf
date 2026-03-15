import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeDate } from '../format';

describe('formatRelativeDate', () => {
  const NOW_EPOCH = 1700000000; // fixed reference point

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockNow() {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_EPOCH * 1000);
  }

  it('returns "Aujourd\'hui" for future timestamps', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH + 3600)).toBe("Aujourd'hui");
  });

  it('returns minutes ago for < 1 hour', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 30)).toBe('Il y a 1min');
    expect(formatRelativeDate(NOW_EPOCH - 120)).toBe('Il y a 2min');
    expect(formatRelativeDate(NOW_EPOCH - 3599)).toBe('Il y a 59min');
  });

  it('returns hours ago for < 1 day', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 3600)).toBe('Il y a 1h');
    expect(formatRelativeDate(NOW_EPOCH - 7200)).toBe('Il y a 2h');
    expect(formatRelativeDate(NOW_EPOCH - 86399)).toBe('Il y a 23h');
  });

  it('returns "Hier" for 1-2 days ago', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 86400)).toBe('Hier');
    expect(formatRelativeDate(NOW_EPOCH - 172799)).toBe('Hier');
  });

  it('returns days ago for 2-7 days', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 172800)).toBe('Il y a 2j');
    expect(formatRelativeDate(NOW_EPOCH - 604799)).toBe('Il y a 6j');
  });

  it('returns weeks ago for 7-30 days', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 604800)).toBe('Il y a 1 sem');
    expect(formatRelativeDate(NOW_EPOCH - 2591999)).toBe('Il y a 4 sem');
  });

  it('returns months ago for > 30 days', () => {
    mockNow();
    expect(formatRelativeDate(NOW_EPOCH - 2592000)).toBe('Il y a 1 mois');
    expect(formatRelativeDate(NOW_EPOCH - 7776000)).toBe('Il y a 3 mois');
  });
});

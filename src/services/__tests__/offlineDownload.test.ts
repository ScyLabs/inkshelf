import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadChapter, downloadManga, getOfflineCachedChapter, deleteOfflineChapter, deleteAllOfflineChapters } from '../offlineDownload';

// Mock api module
vi.mock('../api', () => ({
  fetchMangaChapter: vi.fn(),
}));

// Mock imageProxy module
vi.mock('../imageProxy', () => ({
  buildProxyImageUrl: vi.fn((url: string) => `/api/img/${Buffer.from(url).toString('base64url')}`),
}));

import { fetchMangaChapter } from '../api';

const MANGA = 'one_piece';
const CHAPTER = 'chapter-1';
const MOCK_CHAPTER = {
  title: 'Chapter 1',
  images: ['https://cdn.example.com/img1.jpg', 'https://cdn.example.com/img2.jpg'],
  nextSlug: 'chapter-2',
  prevSlug: null,
  mangaSlug: 'one_piece',
  source: 'scanvf' as const,
};

// Mock Cache Storage API — recreated each test to avoid vi.resetAllMocks clearing implementations
function createMockCache() {
  const store = new Map<string, Response>();
  return {
    put: vi.fn(async (url: string, response: Response) => {
      store.set(url, response.clone());
    }),
    match: vi.fn(async (urlOrReq: string | { url: string }) => {
      const key = typeof urlOrReq === 'string' ? urlOrReq : urlOrReq.url;
      const cached = store.get(key);
      return cached ? cached.clone() : undefined;
    }),
    delete: vi.fn(async (url: string) => store.delete(url)),
    keys: vi.fn(async () => Array.from(store.keys()).map((url) => ({ url }))),
    _store: store,
  };
}

let mockMetaCache: ReturnType<typeof createMockCache>;
let mockImgCache: ReturnType<typeof createMockCache>;
let mockPageCache: ReturnType<typeof createMockCache>;

const cacheMap: Record<string, () => ReturnType<typeof createMockCache>> = {
  'offline-chapters': () => mockMetaCache,
  'proxy-images': () => mockImgCache,
  'offline-pages': () => mockPageCache,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMetaCache = createMockCache();
  mockImgCache = createMockCache();
  mockPageCache = createMockCache();

  // Setup global caches with separate caches per name
  Object.defineProperty(globalThis, 'caches', {
    value: {
      open: vi.fn(async (name: string) => cacheMap[name]?.() ?? mockMetaCache),
      delete: vi.fn(async () => true),
    },
    writable: true,
    configurable: true,
  });

  // Mock fetch for image downloads
  globalThis.fetch = vi.fn(async () => new Response('image-data', { status: 200 })) as unknown as typeof fetch;
});

describe('downloadChapter', () => {
  it('fetches chapter data and caches it along with the reader page', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);

    const onProgress = vi.fn();
    await downloadChapter(MANGA, CHAPTER, onProgress);

    expect(fetchMangaChapter).toHaveBeenCalledWith(MANGA, CHAPTER);
    expect(mockMetaCache.put).toHaveBeenCalled();
    const putUrl = mockMetaCache.put.mock.calls[0][0];
    expect(putUrl).toBe(`/api/manga/${MANGA}/chapter/${CHAPTER}`);

    // Reader page should also be cached in offline-pages
    expect(mockPageCache.put).toHaveBeenCalledWith(
      `/read/${MANGA}/${CHAPTER}`,
      expect.any(Response),
    );
  });

  it('succeeds even when reader page caching fails', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/read/')) return new Response('', { status: 500 });
      return new Response('image-data', { status: 200 });
    }) as unknown as typeof fetch;

    const onProgress = vi.fn();
    await downloadChapter(MANGA, CHAPTER, onProgress);

    // Should still complete successfully — page cache failure is non-blocking
    expect(onProgress).toHaveBeenCalledWith({ total: 2, done: 2, error: false });
  });

  it('downloads all images with progress updates', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);

    const onProgress = vi.fn();
    await downloadChapter(MANGA, CHAPTER, onProgress);

    // initial + 2 images = 3 progress calls
    expect(onProgress).toHaveBeenCalledWith({ total: 2, done: 0, error: false });
    expect(onProgress).toHaveBeenCalledWith({ total: 2, done: 1, error: false });
    expect(onProgress).toHaveBeenCalledWith({ total: 2, done: 2, error: false });
  });

  it('throws when image download fails', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);
    let imageCallCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/read/')) return new Response('<html></html>', { status: 200 });
      imageCallCount++;
      if (imageCallCount === 1) return new Response('ok', { status: 200 });
      throw new Error('Network error');
    }) as unknown as typeof fetch;

    const onProgress = vi.fn();
    await expect(downloadChapter(MANGA, CHAPTER, onProgress)).rejects.toThrow('Some images failed to download');
  });

  it('throws when image returns non-200', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);
    let imageCallCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/read/')) return new Response('<html></html>', { status: 200 });
      imageCallCount++;
      if (imageCallCount === 1) return new Response('not found', { status: 404 });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    const onProgress = vi.fn();
    await expect(downloadChapter(MANGA, CHAPTER, onProgress)).rejects.toThrow('Some images failed to download');
  });
});

describe('getOfflineCachedChapter', () => {
  it('returns null when nothing cached', async () => {
    const result = await getOfflineCachedChapter(MANGA, CHAPTER);
    expect(result).toBeNull();
  });

  it('returns cached chapter data', async () => {
    const url = `/api/manga/${MANGA}/chapter/${CHAPTER}`;
    await mockMetaCache.put(url, new Response(JSON.stringify(MOCK_CHAPTER), {
      headers: { 'Content-Type': 'application/json' },
    }));

    const result = await getOfflineCachedChapter(MANGA, CHAPTER);
    expect(result).toEqual(MOCK_CHAPTER);
  });

  it('returns null when caches unavailable', async () => {
    Object.defineProperty(globalThis, 'caches', {
      value: {
        open: vi.fn(async () => { throw new Error('Storage unavailable'); }),
      },
      writable: true,
      configurable: true,
    });

    const result = await getOfflineCachedChapter(MANGA, CHAPTER);
    expect(result).toBeNull();
  });
});

describe('deleteOfflineChapter', () => {
  it('deletes metadata and associated images from caches', async () => {
    const url = `/api/manga/${MANGA}/chapter/${CHAPTER}`;
    await mockMetaCache.put(url, new Response(JSON.stringify(MOCK_CHAPTER), {
      headers: { 'Content-Type': 'application/json' },
    }));
    for (const img of MOCK_CHAPTER.images) {
      await mockImgCache.put(`/api/img/${Buffer.from(img).toString('base64url')}`, new Response('img-data'));
    }

    await deleteOfflineChapter(MANGA, CHAPTER);

    expect(mockMetaCache.delete).toHaveBeenCalledWith(url);
    for (const img of MOCK_CHAPTER.images) {
      expect(mockImgCache.delete).toHaveBeenCalledWith(`/api/img/${Buffer.from(img).toString('base64url')}`);
    }
  });

  it('deletes the cached reader page from offline-pages', async () => {
    const url = `/api/manga/${MANGA}/chapter/${CHAPTER}`;
    await mockMetaCache.put(url, new Response(JSON.stringify(MOCK_CHAPTER), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await mockPageCache.put(`/read/${MANGA}/${CHAPTER}`, new Response('<html></html>'));

    await deleteOfflineChapter(MANGA, CHAPTER);

    expect(mockPageCache.delete).toHaveBeenCalledWith(`/read/${MANGA}/${CHAPTER}`);
  });

  it('deletes metadata even when no cached response exists', async () => {
    const url = `/api/manga/${MANGA}/chapter/${CHAPTER}`;
    await deleteOfflineChapter(MANGA, CHAPTER);

    expect(mockMetaCache.delete).toHaveBeenCalledWith(url);
    expect(mockImgCache.delete).not.toHaveBeenCalled();
  });

  it('does not throw when caches are unavailable', async () => {
    Object.defineProperty(globalThis, 'caches', {
      value: {
        open: vi.fn(async () => { throw new Error('Storage unavailable'); }),
      },
      writable: true,
      configurable: true,
    });

    await expect(deleteOfflineChapter(MANGA, CHAPTER)).resolves.toBeUndefined();
  });
});

describe('downloadManga', () => {
  const CHAPTERS = ['chapter-1', 'chapter-2', 'chapter-3'];

  it('downloads all chapters sequentially and returns result', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);

    const onProgress = vi.fn();
    const result = await downloadManga(MANGA, CHAPTERS, onProgress);

    expect(result).toEqual({ downloaded: 3, failed: 0 });
    // fetchMangaChapter called once per chapter
    expect(fetchMangaChapter).toHaveBeenCalledTimes(3);
    expect(fetchMangaChapter).toHaveBeenCalledWith(MANGA, 'chapter-1');
    expect(fetchMangaChapter).toHaveBeenCalledWith(MANGA, 'chapter-2');
    expect(fetchMangaChapter).toHaveBeenCalledWith(MANGA, 'chapter-3');
  });

  it('reports progress for each chapter start', async () => {
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);

    const onProgress = vi.fn();
    await downloadManga(MANGA, CHAPTERS, onProgress);

    // Each chapter starts with a progress call showing 0 images
    for (let i = 0; i < CHAPTERS.length; i++) {
      expect(onProgress).toHaveBeenCalledWith({
        totalChapters: 3,
        completedChapters: i,
        currentChapter: CHAPTERS[i],
        currentImages: { total: 0, done: 0, error: false },
      });
    }
  });

  it('counts failed chapters correctly', async () => {
    let callCount = 0;
    vi.mocked(fetchMangaChapter).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Source down');
      return MOCK_CHAPTER;
    });

    const onProgress = vi.fn();
    const result = await downloadManga(MANGA, CHAPTERS, onProgress);

    expect(result).toEqual({ downloaded: 2, failed: 1 });
  });

  it('stops on abort signal between chapters', async () => {
    const controller = new AbortController();
    let callCount = 0;
    vi.mocked(fetchMangaChapter).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) controller.abort();
      return MOCK_CHAPTER;
    });

    const onProgress = vi.fn();
    const result = await downloadManga(MANGA, CHAPTERS, onProgress, controller.signal);

    // Should have processed chapters 1 and 2, then stopped before 3
    expect(fetchMangaChapter).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ downloaded: 2, failed: 0 });
  });

  it('passes abort signal to downloadChapter', async () => {
    const controller = new AbortController();
    vi.mocked(fetchMangaChapter).mockResolvedValue(MOCK_CHAPTER);

    // Track fetch calls to verify signal is passed
    const fetchSpy = vi.fn(async () => new Response('image-data', { status: 200 })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await downloadManga(MANGA, ['chapter-1'], vi.fn(), controller.signal);

    // At least one fetch call should have received the signal via options
    const callsWithSignal = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[1]?.signal === controller.signal,
    );
    expect(callsWithSignal.length).toBeGreaterThan(0);
  });

  it('handles empty chapter list', async () => {
    const onProgress = vi.fn();
    const result = await downloadManga(MANGA, [], onProgress);

    expect(result).toEqual({ downloaded: 0, failed: 0 });
    expect(onProgress).not.toHaveBeenCalled();
    expect(fetchMangaChapter).not.toHaveBeenCalled();
  });

  it('continues downloading after a chapter fails', async () => {
    let callCount = 0;
    vi.mocked(fetchMangaChapter).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('First chapter fails');
      return MOCK_CHAPTER;
    });

    const onProgress = vi.fn();
    const result = await downloadManga(MANGA, CHAPTERS, onProgress);

    // All 3 chapters attempted despite first failure
    expect(fetchMangaChapter).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ downloaded: 2, failed: 1 });
  });
});

describe('deleteAllOfflineChapters', () => {
  it('deletes all entries and their images', async () => {
    const url1 = `/api/manga/${MANGA}/chapter/${CHAPTER}`;
    const url2 = `/api/manga/${MANGA}/chapter/chapter-2`;
    const ch2 = { ...MOCK_CHAPTER, title: 'Chapter 2', images: ['https://cdn.example.com/img3.jpg'] };

    await mockMetaCache.put(url1, new Response(JSON.stringify(MOCK_CHAPTER), {
      headers: { 'Content-Type': 'application/json' },
    }));
    await mockMetaCache.put(url2, new Response(JSON.stringify(ch2), {
      headers: { 'Content-Type': 'application/json' },
    }));

    await deleteAllOfflineChapters();

    // All 3 images should be deleted from img cache
    expect(mockImgCache.delete).toHaveBeenCalledTimes(3);
    // Both offline caches should be deleted entirely
    expect(globalThis.caches.delete).toHaveBeenCalledWith('offline-chapters');
    expect(globalThis.caches.delete).toHaveBeenCalledWith('offline-pages');
  });

  it('does not throw when caches are unavailable', async () => {
    Object.defineProperty(globalThis, 'caches', {
      value: {
        open: vi.fn(async () => { throw new Error('Storage unavailable'); }),
        delete: vi.fn(async () => true),
      },
      writable: true,
      configurable: true,
    });

    await expect(deleteAllOfflineChapters()).resolves.toBeUndefined();
  });
});

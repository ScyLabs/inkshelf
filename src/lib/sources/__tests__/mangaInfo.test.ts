import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScanVfSource } from '../scanvf';
import { createMangaPillSource } from '../mangapill';
import { createMgekoSource } from '../mgeko';
import { createHarimangaSource } from '../harimanga';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockHtmlResponse(html: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(html),
  });
}

function mockFailedResponse(status = 404) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------- ScanVF ----------
describe('ScanVF fetchMangaInfo', () => {
  const source = createScanVfSource();

  it('extracts synopsis, author, genres, and status', async () => {
    mockHtmlResponse(`
      <div class="well">
        <h5><strong>Résumé</strong></h5>
        <p>Gol D. Roger était connu comme le &quot;Roi des Pirates&quot;, le plus fort de tous.</p>
      </div>
      <dl class="dl-horizontal">
        <dt>Auteur(s)</dt>
        <dd><a href="/author/oda">Oda, Eiichiro</a></dd>
        <dt>Catégories</dt>
        <dd>
          <a href="/category/action">Action</a>,&nbsp;
          <a href="/category/adventure">Adventure</a>,&nbsp;
          <a href="/category/comedy">Comedy</a>
        </dd>
        <dt>Statut</dt>
        <dd><span class="label label-success">En cours</span></dd>
      </dl>
    `);

    const info = await source.fetchMangaInfo!('one_piece');
    expect(info.synopsis).toBe('Gol D. Roger était connu comme le "Roi des Pirates", le plus fort de tous.');
    expect(info.author).toBe('Oda, Eiichiro');
    expect(info.artist).toBeNull();
    expect(info.genres).toEqual(['Action', 'Adventure', 'Comedy']);
    expect(info.status).toBe('ongoing');
  });

  it('returns nulls when fields are missing', async () => {
    mockHtmlResponse('<html><body><h1>Manga Page</h1></body></html>');

    const info = await source.fetchMangaInfo!('some_manga');
    expect(info.synopsis).toBeNull();
    expect(info.author).toBeNull();
    expect(info.genres).toEqual([]);
    expect(info.status).toBeNull();
  });

  it('normalizes "Terminé" to completed', async () => {
    mockHtmlResponse(`
      <dl><dt>Statut</dt><dd><span>Terminé</span></dd></dl>
    `);

    const info = await source.fetchMangaInfo!('naruto');
    expect(info.status).toBe('completed');
  });

  it('throws on invalid slug', async () => {
    await expect(source.fetchMangaInfo!('invalid slug!')).rejects.toThrow('Invalid manga slug format');
  });

  it('throws on fetch failure', async () => {
    mockFailedResponse(500);
    await expect(source.fetchMangaInfo!('one_piece')).rejects.toThrow('Failed to fetch manga page');
  });
});

// ---------- MangaPill ----------
describe('MangaPill fetchMangaInfo', () => {
  const source = createMangaPillSource();

  it('extracts synopsis, genres, and status', async () => {
    mockHtmlResponse(`
      <p class="text-sm text--secondary">Gol D. Roger was known as the &#34;Pirate King,&#34; the strongest pirate.<br/>
      Twenty-two years later, the tale begins. [Written by MAL Rewrite]</p>
      <label class="text-secondary">Status</label>
      <div>publishing</div>
      <label class="text-secondary">Genres</label>
      <a class="text-sm mr-1 text-brand" href="/search?genre=Action">Action</a>
      <a class="text-sm mr-1 text-brand" href="/search?genre=Adventure">Adventure</a>
    `);

    const info = await source.fetchMangaInfo!('mp-2-one-piece');
    expect(info.synopsis).toContain('Gol D. Roger was known as the "Pirate King,"');
    expect(info.synopsis).not.toContain('[Written by MAL Rewrite]');
    expect(info.author).toBeNull();
    expect(info.artist).toBeNull();
    expect(info.genres).toEqual(['Action', 'Adventure']);
    expect(info.status).toBe('ongoing');
  });

  it('handles finished status', async () => {
    mockHtmlResponse(`
      <label class="text-secondary">Status</label>
      <div>finished</div>
    `);

    const info = await source.fetchMangaInfo!('mp-5-naruto');
    expect(info.status).toBe('completed');
  });

  it('handles numeric HTML entities with fromCodePoint', async () => {
    mockHtmlResponse(`
      <p class="text-sm text--secondary">Test &#128516; emoji and &#233; accent</p>
    `);

    const info = await source.fetchMangaInfo!('mp-1-test');
    expect(info.synopsis).toContain('\u{1F604}'); // 😄
    expect(info.synopsis).toContain('é');
  });

  it('throws on invalid slug format', async () => {
    await expect(source.fetchMangaInfo!('not-mp-slug')).rejects.toThrow('Invalid manga slug format');
  });
});

// ---------- Mgeko ----------
describe('Mgeko fetchMangaInfo', () => {
  const source = createMgekoSource();

  it('extracts synopsis after "The Summary is" marker', async () => {
    mockHtmlResponse(`
      <p class="description">
        One Piece is a Manga/Manhwa in english language.
        The Summary is<br><br>
        Gol D. Roger was the King of the Pirates.
      </p>
      <div class="author"><a><span itemprop="author">Oda Eiichiro</span></a></div>
      <strong class="ongoing">Ongoing</strong><small>Status</small>
      <strong>Categories</strong>
      <ul>
        <li><a title="Action Genre" class="property-item">Action</a></li>
        <li><a title=" Adventure Genre" class="property-item"> Adventure</a></li>
      </ul>
    `);

    const info = await source.fetchMangaInfo!('mgk-one-piece');
    expect(info.synopsis).toBe('Gol D. Roger was the King of the Pirates.');
    expect(info.author).toBe('Oda Eiichiro');
    expect(info.artist).toBeNull();
    expect(info.genres).toEqual(['Action', 'Adventure']);
    expect(info.status).toBe('ongoing');
  });

  it('falls back to full description if no "Summary is" marker', async () => {
    mockHtmlResponse(`
      <p class="description">Just a plain description of this manga.</p>
    `);

    const info = await source.fetchMangaInfo!('mgk-test-manga');
    expect(info.synopsis).toBe('Just a plain description of this manga.');
  });

  it('returns null author when "Updating"', async () => {
    mockHtmlResponse(`
      <div class="author"><a><span itemprop="author">Updating</span></a></div>
    `);

    const info = await source.fetchMangaInfo!('mgk-some-manga');
    expect(info.author).toBeNull();
  });

  it('extracts completed status', async () => {
    mockHtmlResponse(`
      <strong class="completed">Completed</strong><small>Status</small>
    `);

    const info = await source.fetchMangaInfo!('mgk-finished-manga');
    expect(info.status).toBe('completed');
  });

  it('throws on invalid slug', async () => {
    await expect(source.fetchMangaInfo!('invalid')).rejects.toThrow('Invalid manga slug format');
  });
});

// ---------- Harimanga ----------
describe('Harimanga fetchMangaInfo', () => {
  const source = createHarimangaSource();

  it('extracts synopsis, author, artist, genres, and status', async () => {
    mockHtmlResponse(`
      <div class="description-summary">
        <div class="summary__content show-more">
          <p>In a world of magic, Sung Jin-Woo is the weakest hunter.</p>
          <p>However, a mysterious System grants him power.</p>
        </div>
      </div>
      <div class="post-content_item">
        <div class="summary-heading"><h5>Author(s)</h5></div>
        <div class="summary-content">
          <div class="author-content">
            <a href="/author/chugong" rel="tag">Chugong</a>
          </div>
        </div>
      </div>
      <div class="post-content_item">
        <div class="summary-heading"><h5>Artist(s)</h5></div>
        <div class="summary-content">
          <div class="artist-content">
            <a href="/artist/dubu" rel="tag">DUBU (REDICE STUDIO)</a>
          </div>
        </div>
      </div>
      <div class="post-content_item">
        <div class="summary-heading"><h5>Status</h5></div>
        <div class="summary-content">OnGoing</div>
      </div>
      <div class="genres-content">
        <a href="/genre/action" rel="tag">Action</a>,
        <a href="/genre/adventure" rel="tag">Adventure</a>,
        <a href="/genre/fantasy" rel="tag">Fantasy</a>
      </div>
    `);

    const info = await source.fetchMangaInfo!('hm-solo-leveling');
    expect(info.synopsis).toContain('Sung Jin-Woo is the weakest hunter');
    expect(info.synopsis).toContain('mysterious System grants him power');
    expect(info.author).toBe('Chugong');
    expect(info.artist).toBe('DUBU (REDICE STUDIO)');
    expect(info.genres).toEqual(['Action', 'Adventure', 'Fantasy']);
    expect(info.status).toBe('ongoing');
  });

  it('handles Completed status (case insensitive)', async () => {
    mockHtmlResponse(`
      <div class="post-content_item">
        <div class="summary-heading"><h5>Status</h5></div>
        <div class="summary-content">Completed</div>
      </div>
    `);

    const info = await source.fetchMangaInfo!('hm-naruto');
    expect(info.status).toBe('completed');
  });

  it('handles HTML entities in synopsis', async () => {
    mockHtmlResponse(`
      <div class="description-summary">
        <div class="summary__content">
          <p>The hero&#8217;s journey &#8220;begins&#8221; now&#8230;</p>
        </div>
      </div>
    `);

    const info = await source.fetchMangaInfo!('hm-test-manga');
    expect(info.synopsis).toContain('\u2019'); // right single quote
    expect(info.synopsis).toContain('\u201c'); // left double quote
    expect(info.synopsis).toContain('\u2026'); // ellipsis
  });

  it('returns nulls when no data', async () => {
    mockHtmlResponse('<html><body></body></html>');

    const info = await source.fetchMangaInfo!('hm-empty-manga');
    expect(info.synopsis).toBeNull();
    expect(info.author).toBeNull();
    expect(info.artist).toBeNull();
    expect(info.genres).toEqual([]);
    expect(info.status).toBeNull();
  });

  it('throws on invalid slug', async () => {
    await expect(source.fetchMangaInfo!('bad-slug')).rejects.toThrow('Invalid manga slug format');
  });
});

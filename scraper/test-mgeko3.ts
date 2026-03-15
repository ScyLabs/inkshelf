import { fetchWithFlare } from '../src/lib/sources/flaresolverr';

const MANGA_CARD_RE =
  /<a\s+href="\/manga\/([^"]+)\/"[^>]*>\s*<img\s+src="(https:\/\/imgsrv4\.com\/[^"]+)"/g;
const MANGA_TITLE_RE =
  /<h3\s+class="comic-card__title">\s*<a\s+href="\/manga\/([^"]+)\/"[^>]*>([^<]+)<\/a>/g;

async function test() {
  const html = await fetchWithFlare('https://www.mgeko.cc/browse-comics/?page=1', { maxTimeout: 30000 });
  if (!html) { console.log('No HTML'); return; }

  console.log('HTML length:', html.length);
  console.log('Has /manga/ links:', html.includes('/manga/'));
  console.log('Has comic-card__title:', html.includes('comic-card__title'));

  const mangaLinks = html.match(/href="\/manga\/[^"]+"/g);
  console.log('Manga links:', mangaLinks?.length ?? 0);
  if (mangaLinks) console.log('Sample:', mangaLinks.slice(0, 5));

  MANGA_CARD_RE.lastIndex = 0;
  let cardCount = 0;
  let m;
  while ((m = MANGA_CARD_RE.exec(html)) !== null) cardCount++;
  console.log('Card regex matches:', cardCount);

  MANGA_TITLE_RE.lastIndex = 0;
  let titleCount = 0;
  const titles: string[] = [];
  while ((m = MANGA_TITLE_RE.exec(html)) !== null) {
    titleCount++;
    titles.push(m[2]);
  }
  console.log('Title regex matches:', titleCount);
  if (titles.length > 0) console.log('Titles:', titles.slice(0, 5));

  // Show actual card HTML
  const idx = html.indexOf('comic-card__title');
  if (idx > -1) {
    console.log('\n=== Sample card ===');
    console.log(html.substring(Math.max(0, idx - 200), idx + 300));
  }
}

test().catch(console.error);

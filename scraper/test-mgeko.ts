import { solveCookies } from '../src/lib/sources/flaresolverr';

const MANGA_CARD_RE =
  /<a\s+href="\/manga\/([^"]+)\/"[^>]*>\s*<img\s+src="(https:\/\/imgsrv4\.com\/[^"]+)"/g;

const MANGA_TITLE_RE =
  /<h3\s+class="comic-card__title">\s*<a\s+href="\/manga\/([^"]+)\/"[^>]*>([^<]+)<\/a>/g;

async function test() {
  const session = await solveCookies('https://www.mgeko.cc/browse-comics/?page=1');
  if (!session) { console.log('No session'); return; }

  const res = await fetch('https://www.mgeko.cc/browse-comics/?page=1', {
    headers: {
      Referer: 'https://www.mgeko.cc/',
      'User-Agent': session.userAgent,
      Cookie: session.cookies,
    },
  });
  const text = await res.text();
  console.log('Status:', res.status, 'HTML length:', text.length);
  console.log('comic-card count:', (text.match(/comic-card/g) || []).length);
  console.log('comic-card__title count:', (text.match(/comic-card__title/g) || []).length);

  let m;
  let cardCount = 0;
  MANGA_CARD_RE.lastIndex = 0;
  while ((m = MANGA_CARD_RE.exec(text)) !== null) cardCount++;
  console.log('Card regex matches:', cardCount);

  let titleCount = 0;
  MANGA_TITLE_RE.lastIndex = 0;
  while ((m = MANGA_TITLE_RE.exec(text)) !== null) titleCount++;
  console.log('Title regex matches:', titleCount);

  // Show a sample of actual card HTML
  const cardIdx = text.indexOf('comic-card');
  if (cardIdx > -1) {
    console.log('Sample card HTML:', text.substring(cardIdx, cardIdx + 600));
  } else {
    console.log('No comic-card found in HTML');
    // Show around href="/manga/"
    const mangaIdx = text.indexOf('/manga/');
    if (mangaIdx > -1) {
      console.log('Sample manga link:', text.substring(Math.max(0, mangaIdx - 100), mangaIdx + 200));
    }
  }
}

test().catch(console.error);

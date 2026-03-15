import { solveCookies } from '../src/lib/sources/flaresolverr';

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
  
  // Find actual manga links
  const mangaLinks = text.match(/href="\/manga\/[^"]+"/g);
  console.log('Manga links found:', mangaLinks?.length ?? 0);
  if (mangaLinks) console.log('Sample links:', mangaLinks.slice(0, 5));

  // Find img tags with covers
  const imgs = text.match(/<img[^>]+src="[^"]*"[^>]*>/g);
  console.log('Img tags:', imgs?.length ?? 0);
  if (imgs) console.log('Sample imgs:', imgs.slice(0, 3));

  // Extract a chunk of HTML around the first manga link
  const idx = text.indexOf('href="/manga/');
  if (idx > -1) {
    console.log('\n=== HTML around first manga link ===');
    console.log(text.substring(Math.max(0, idx - 300), idx + 400));
  }
}

test().catch(console.error);

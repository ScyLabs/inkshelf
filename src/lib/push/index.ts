import webpush from 'web-push';
import { getDb } from '@/lib/db';
import { pushSubscriptions, userLibrary } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:noreply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const db = getDb();
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    createdAt: Date.now(),
  }).onConflictDoUpdate({
    target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
    set: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: Date.now(),
    },
  });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const db = getDb();
  await db.delete(pushSubscriptions).where(
    and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)),
  );
}

export async function notifyNewChapters(
  mangaSlug: string,
  title: string,
  label: string,
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const db = getDb();

  const libraryEntries = await db
    .select({ userId: userLibrary.userId })
    .from(userLibrary)
    .where(eq(userLibrary.mangaSlug, mangaSlug));

  if (libraryEntries.length === 0) return;

  const userIds = libraryEntries.map((e) => e.userId);

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: 'New Chapter',
    body: `${title} - ${label}`,
    data: { url: `/manga/${mangaSlug}` },
  });

  const sendPromises = subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await removeSubscription(sub.userId, sub.endpoint);
      } else {
        console.error(`[push] Failed to send to ${sub.endpoint.slice(0, 60)}:`, err);
      }
    }
  });

  await Promise.allSettled(sendPromises);
}

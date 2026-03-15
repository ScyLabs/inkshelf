import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push';
import { isValidUuid } from '@/lib/progress/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, subscription } = body;

    if (!userId || !isValidUuid(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }
    if (
      !subscription?.endpoint ||
      typeof subscription.endpoint !== 'string' ||
      subscription.endpoint.length > 2048 ||
      !subscription.endpoint.startsWith('https://') ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    await saveSubscription(userId, subscription);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

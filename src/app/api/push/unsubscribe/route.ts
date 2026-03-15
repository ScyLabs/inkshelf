import { NextRequest, NextResponse } from 'next/server';
import { removeSubscription } from '@/lib/push';
import { isValidUuid } from '@/lib/progress/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, endpoint } = body;

    if (!userId || !isValidUuid(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    }
    if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 2048) {
      return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    }

    await removeSubscription(userId, endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

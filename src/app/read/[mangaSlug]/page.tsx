import { redirect } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function LegacyReadPage({ params }: { params: Promise<{ mangaSlug: string }> }) {
  redirect('/');
}

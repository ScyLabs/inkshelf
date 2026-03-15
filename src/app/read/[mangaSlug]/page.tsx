import { redirect } from 'next/navigation';

export default async function LegacyReadPage({
  params,
}: {
  params: Promise<{ mangaSlug: string }>;
}) {
  const { mangaSlug } = await params;
  // Legacy URLs like /read/chapitre-123 → /read/one_piece/chapitre-123
  redirect(`/read/one_piece/${mangaSlug}`);
}

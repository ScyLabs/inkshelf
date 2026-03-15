import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const ARCHIVE_BASE_PATH = process.env.ARCHIVE_PATH || '/data/manga';

const VALID_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

function validatePathComponent(part: string): string {
  if (part.includes('..') || part.includes('/') || part.includes('\\') || part.includes('\0')) {
    throw new Error(`Invalid path component: ${part}`);
  }
  return part;
}

function validateExt(ext: string): string {
  if (!VALID_EXTS.has(ext)) {
    throw new Error(`Invalid image extension: ${ext}`);
  }
  return ext;
}

export function getImagePath(mangaSlug: string, chapterSlug: string, pageIndex: number, ext: string): string {
  const filePath = join(
    ARCHIVE_BASE_PATH,
    validatePathComponent(mangaSlug),
    validatePathComponent(chapterSlug),
    `${pageIndex}.${validateExt(ext)}`,
  );
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(ARCHIVE_BASE_PATH))) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return resolved;
}

export async function ensureDir(mangaSlug: string, chapterSlug: string): Promise<void> {
  const dir = join(
    ARCHIVE_BASE_PATH,
    validatePathComponent(mangaSlug),
    validatePathComponent(chapterSlug),
  );
  await mkdir(dir, { recursive: true });
}

export async function saveImage(mangaSlug: string, chapterSlug: string, pageIndex: number, buffer: Buffer, ext: string): Promise<void> {
  await ensureDir(mangaSlug, chapterSlug);
  const filePath = getImagePath(mangaSlug, chapterSlug, pageIndex, ext);
  await writeFile(filePath, buffer);
}

export async function readImage(mangaSlug: string, chapterSlug: string, pageIndex: number, ext: string): Promise<Buffer | null> {
  const filePath = getImagePath(mangaSlug, chapterSlug, pageIndex, ext);
  if (!existsSync(filePath)) return null;
  return readFile(filePath);
}

export function imageExists(mangaSlug: string, chapterSlug: string, pageIndex: number, ext: string): boolean {
  return existsSync(getImagePath(mangaSlug, chapterSlug, pageIndex, ext));
}

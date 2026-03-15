'use client';

import { useState } from 'react';
import { useUserStore } from '../../stores/userStore';

export default function UserIdPanel() {
  const userId = useUserStore((s) => s.userId);
  const setUserId = useUserStore((s) => s.setUserId);
  const regenerateId = useUserStore((s) => s.regenerateId);
  const knownUsers = useUserStore((s) => s.knownUsers);
  const currentMeta = knownUsers[userId];
  const [inputValue, setInputValue] = useState('');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(userId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const [error, setError] = useState('');

  function handlePaste() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (!UUID_RE.test(trimmed)) {
      setError('Invalid UUID format');
      return;
    }
    setError('');
    setUserId(trimmed);
    setInputValue('');
  }

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-white">User ID</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Used to identify your reading progress across devices.
      </p>
      {currentMeta?.lastUseAt && (
        <p className="mt-1 text-xs text-zinc-600">
          Last active: {new Date(currentMeta.lastUseAt).toLocaleString()}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300">
          {userId}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Paste another UUID..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-orange-500 transition-colors"
        />
        <button
          type="button"
          onClick={handlePaste}
          disabled={!inputValue.trim()}
          className="shrink-0 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Set
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={regenerateId}
        className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:bg-zinc-800"
      >
        Regenerate ID
      </button>
    </div>
  );
}

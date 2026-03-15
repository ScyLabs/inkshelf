import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  userId: string;
  createdAt: number;
  knownUsers: Record<string, { lastUseAt: number }>;
  regenerateId: () => void;
  setUserId: (id: string) => void;
  updateLastUse: (id: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => {
      const initialId = crypto.randomUUID();
      return {
      userId: initialId,
      createdAt: Date.now(),
      knownUsers: { [initialId]: { lastUseAt: Date.now() } },

      regenerateId: () => {
        const newId = crypto.randomUUID();
        set((state) => ({
          userId: newId,
          createdAt: Date.now(),
          knownUsers: { ...state.knownUsers, [newId]: { lastUseAt: Date.now() } },
        }));
      },

      setUserId: (userId) =>
        set((state) => ({
          userId,
          knownUsers: { ...state.knownUsers, [userId]: { lastUseAt: Date.now() } },
        })),

      updateLastUse: (id) =>
        set((state) => ({
          knownUsers: { ...state.knownUsers, [id]: { lastUseAt: Date.now() } },
        })),
    };
    },
    {
      name: 'manga-reader-user',
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          const old = persisted as { userId?: string; createdAt?: number };
          const userId = old.userId ?? crypto.randomUUID();
          return {
            ...old,
            userId,
            createdAt: old.createdAt ?? Date.now(),
            knownUsers: { [userId]: { lastUseAt: Date.now() } },
          };
        }
        return persisted as UserState;
      },
    }
  )
);

import { describe, it, expect, beforeEach } from 'vitest';
import { useUserStore } from '../userStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('userStore', () => {
  beforeEach(() => {
    const id = crypto.randomUUID();
    useUserStore.setState({
      userId: id,
      createdAt: Date.now(),
      knownUsers: { [id]: { lastUseAt: Date.now() } },
    });
  });

  it('starts with a valid UUID', () => {
    const { userId } = useUserStore.getState();
    expect(UUID_RE.test(userId)).toBe(true);
  });

  it('initial userId is in knownUsers', () => {
    const { userId, knownUsers } = useUserStore.getState();
    expect(knownUsers[userId]).toBeDefined();
    expect(knownUsers[userId].lastUseAt).toBeGreaterThan(0);
  });

  describe('regenerateId', () => {
    it('creates a new UUID', () => {
      const oldId = useUserStore.getState().userId;
      useUserStore.getState().regenerateId();
      const newId = useUserStore.getState().userId;
      expect(newId).not.toBe(oldId);
      expect(UUID_RE.test(newId)).toBe(true);
    });

    it('adds new ID to knownUsers', () => {
      useUserStore.getState().regenerateId();
      const { userId, knownUsers } = useUserStore.getState();
      expect(knownUsers[userId]).toBeDefined();
    });

    it('preserves old ID in knownUsers', () => {
      const oldId = useUserStore.getState().userId;
      useUserStore.getState().regenerateId();
      const { knownUsers } = useUserStore.getState();
      expect(knownUsers[oldId]).toBeDefined();
    });
  });

  describe('setUserId', () => {
    it('changes the userId', () => {
      const newId = crypto.randomUUID();
      useUserStore.getState().setUserId(newId);
      expect(useUserStore.getState().userId).toBe(newId);
    });

    it('adds new userId to knownUsers', () => {
      const newId = crypto.randomUUID();
      useUserStore.getState().setUserId(newId);
      expect(useUserStore.getState().knownUsers[newId]).toBeDefined();
    });
  });

  describe('updateLastUse', () => {
    it('updates lastUseAt for existing user', () => {
      const { userId } = useUserStore.getState();
      const before = useUserStore.getState().knownUsers[userId].lastUseAt;
      useUserStore.getState().updateLastUse(userId);
      const after = useUserStore.getState().knownUsers[userId].lastUseAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('creates entry for unknown user', () => {
      const newId = crypto.randomUUID();
      useUserStore.getState().updateLastUse(newId);
      expect(useUserStore.getState().knownUsers[newId]).toBeDefined();
    });
  });
});

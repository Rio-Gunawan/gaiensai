import type { UserData } from '../../../types/types';

type StoredUserProfile = Exclude<UserData, null>;

const JUNIOR_PROFILE_CACHE_PREFIX = 'junior_profile_cache:v1:';

const getProfileKey = (userId: string) =>
  `${JUNIOR_PROFILE_CACHE_PREFIX}${userId}`;

export const readCachedJuniorProfile = (
  userId: string,
): StoredUserProfile | null => {
  try {
    const raw = window.localStorage.getItem(getProfileKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { profile?: StoredUserProfile };
    return parsed.profile ?? null;
  } catch {
    return null;
  }
};

export const writeCachedJuniorProfile = (
  userId: string,
  profile: StoredUserProfile,
): void => {
  window.localStorage.setItem(
    getProfileKey(userId),
    JSON.stringify({
      profile,
      cachedAt: Date.now(),
    }),
  );
};

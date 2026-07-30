import type { PlatformStore } from "./platform-types";

export interface PlatformRepository {
  load(seed: PlatformStore): PlatformStore;
  save(store: PlatformStore): void;
}

/**
 * Demo implementation. The UI only depends on PlatformRepository, so this can
 * later be replaced by a Firebase implementation without rewriting screens.
 */
class BrowserStorageRepository implements PlatformRepository {
  private readonly key = "mister-bean-platform";

  load(seed: PlatformStore): PlatformStore {
    if (typeof window === "undefined") return seed;

    try {
      const value = window.localStorage.getItem(this.key);
      return value ? (JSON.parse(value) as PlatformStore) : seed;
    } catch {
      return seed;
    }
  }

  save(store: PlatformStore): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(this.key, JSON.stringify(store));
  }
}

export const platformRepository: PlatformRepository =
  new BrowserStorageRepository();

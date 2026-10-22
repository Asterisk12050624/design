/**
 * StorageManager.js - 世界持久化管理器 (LocalStorage)
 */

const STORAGE_KEY = 'MINI_VOXEL_WORLD_SAVE_V1';

export class StorageManager {
  static save(voxelWorld) {
    try {
      const dataStr = voxelWorld.serialize();
      localStorage.setItem(STORAGE_KEY, dataStr);
      return true;
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
      return false;
    }
  }

  static load(voxelWorld) {
    try {
      const dataStr = localStorage.getItem(STORAGE_KEY);
      if (!dataStr) return false;
      return voxelWorld.deserialize(dataStr);
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
      return false;
    }
  }

  static clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.warn('LocalStorage clear failed:', e);
      return false;
    }
  }

  static hasSave() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
}

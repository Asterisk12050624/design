/**
 * Inventory.js - 快捷欄 (Hotbar) 與物品庫存管理
 */
import { BLOCK_TYPES, BLOCK_INFO } from '../world/VoxelWorld.js';

export class Inventory {
  constructor(slotCount = 9) {
    this.slotCount = slotCount;
    this.activeIndex = 0;
    this.slots = [];
    this.listeners = [];

    this.initDefaultSlots();
  }

  initDefaultSlots() {
    this.slots = [
      { blockId: BLOCK_TYPES.GRASS, count: 16 },
      { blockId: BLOCK_TYPES.DIRT, count: 16 },
      { blockId: BLOCK_TYPES.STONE, count: 16 },
      { blockId: BLOCK_TYPES.LOG, count: 8 },
      { blockId: BLOCK_TYPES.LEAVES, count: 12 },
      { blockId: BLOCK_TYPES.PLANKS, count: 16 },
      { blockId: BLOCK_TYPES.SAND, count: 8 },
      { blockId: BLOCK_TYPES.BRICK, count: 8 },
      { blockId: BLOCK_TYPES.AIR, count: 0 }
    ];
  }

  getActiveSlot() {
    return this.slots[this.activeIndex];
  }

  setActiveIndex(idx) {
    if (idx >= 0 && idx < this.slotCount) {
      this.activeIndex = idx;
      this.notify();
    }
  }

  /**
   * 拾取物品進快捷欄 (STEP 3: 數字 +1)
   */
  addItem(blockId, amount = 1) {
    if (blockId === BLOCK_TYPES.AIR || amount <= 0) return false;

    // 1. 優先堆疊至已有同類方塊的格子
    for (let i = 0; i < this.slotCount; i++) {
      if (this.slots[i].blockId === blockId) {
        this.slots[i].count += amount;
        this.notify();
        return true;
      }
    }

    // 2. 放入第一個空格子
    for (let i = 0; i < this.slotCount; i++) {
      if (this.slots[i].count <= 0 || this.slots[i].blockId === BLOCK_TYPES.AIR) {
        this.slots[i].blockId = blockId;
        this.slots[i].count = amount;
        this.notify();
        return true;
      }
    }

    return false;
  }

  /**
   * 消耗手持物品 (STEP 4: 數字 -1，數字是 0 禁止放置)
   */
  consumeActiveItem(amount = 1) {
    const slot = this.getActiveSlot();
    if (!slot || slot.count < amount || slot.blockId === BLOCK_TYPES.AIR) {
      return false; // 數字是 0 或不足，放不出來！
    }

    slot.count -= amount;
    if (slot.count <= 0) {
      slot.count = 0;
      // 保留其原本格子型別或標記為 0
    }
    this.notify();
    return true;
  }

  onChange(callback) {
    this.listeners.push(callback);
    callback(this);
  }

  notify() {
    for (const cb of this.listeners) {
      cb(this);
    }
  }
}

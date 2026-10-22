/**
 * PlacementSystem.js - 方塊放置、防卡判定與庫存扣減 (STEP 4)
 */
import { BLOCK_TYPES, WORLD_SIZE } from '../world/VoxelWorld.js';

export class PlacementSystem {
  constructor(voxelWorld, inventory, playerController) {
    this.voxelWorld = voxelWorld;
    this.inventory = inventory;
    this.playerController = playerController;

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('mousedown', (e) => {
      // 2: 滑鼠右鍵 (放置方塊)
      if (e.button === 2 && document.pointerLockElement) {
        this.placeBlock();
      }
    });

    // 禁用右鍵快顯功能表
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  placeBlock() {
    // 1. 取得瞄準的方塊
    const target = this.miningSystem ? this.miningSystem.getTargetVoxel() : null;
    if (!target) return false;

    // 2. 庫存檢查 (STEP 4 規範：不可以數字是 0 還放得出來)
    const activeSlot = this.inventory.getActiveSlot();
    if (!activeSlot || activeSlot.count <= 0 || activeSlot.blockId === BLOCK_TYPES.AIR) {
      console.log('庫存數量為 0 或未手持有效方塊，無法放置！');
      return false;
    }

    // 3. 計算放置位置（點擊表面法線方向）
    const px = target.x + target.normal.x;
    const py = target.y + target.normal.y;
    const pz = target.z + target.normal.z;

    // 邊界檢查
    if (!this.voxelWorld.inBounds(px, py, pz)) {
      return false;
    }

    // 該位置必須為空氣
    if (this.voxelWorld.getVoxel(px, py, pz) !== BLOCK_TYPES.AIR) {
      return false;
    }

    // 4. 防卡判定：不可放置在玩家身體重疊處
    if (this.intersectsPlayer(px, py, pz)) {
      console.log('放置位置與玩家身軀重疊，防卡保護生效！');
      return false;
    }

    // 5. 執行放置與扣減 (STEP 4: 放出一格，數字 -1)
    const success = this.voxelWorld.setVoxel(px, py, pz, activeSlot.blockId);
    if (success) {
      this.inventory.consumeActiveItem(1);
      return true;
    }
    return false;
  }

  /**
   * 檢查目標方塊是否與玩家 AABB 碰撞盒相交
   */
  intersectsPlayer(bx, by, bz) {
    const player = this.playerController;
    const halfW = player.width / 2;

    const playerMinX = player.position.x - halfW;
    const playerMaxX = player.position.x + halfW;
    const playerMinY = player.position.y;
    const playerMaxY = player.position.y + player.currentHeight;
    const playerMinZ = player.position.z - halfW;
    const playerMaxZ = player.position.z + halfW;

    const blockMinX = bx;
    const blockMaxX = bx + 1;
    const blockMinY = by;
    const blockMaxY = by + 1;
    const blockMinZ = bz;
    const blockMaxZ = bz + 1;

    // AABB 重疊檢測
    return (
      playerMinX < blockMaxX && playerMaxX > blockMinX &&
      playerMinY < blockMaxY && playerMaxY > blockMinY &&
      playerMinZ < blockMaxZ && playerMaxZ > blockMinZ
    );
  }

  setMiningSystem(miningSystem) {
    this.miningSystem = miningSystem;
  }
}

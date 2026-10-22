/**
 * VoxelWorld.js - 32×32×32 體素世界資料模型與地圖生成
 */

export const WORLD_SIZE = 32;
export const TOTAL_VOXELS = WORLD_SIZE * WORLD_SIZE * WORLD_SIZE; // 32,768

export const BLOCK_TYPES = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  LOG: 4,
  LEAVES: 5,
  PLANKS: 6,
  SAND: 7,
  BRICK: 8
};

export const BLOCK_INFO = {
  [BLOCK_TYPES.AIR]: { name: '空氣', hardness: 0 },
  [BLOCK_TYPES.GRASS]: { name: '草地', hardness: 0.7, icon: 'grass.png' },
  [BLOCK_TYPES.DIRT]: { name: '泥土', hardness: 0.7, icon: 'dirt.png' },
  [BLOCK_TYPES.STONE]: { name: '石頭', hardness: 2.0, icon: 'stone.png' },
  [BLOCK_TYPES.LOG]: { name: '原木', hardness: 1.2, icon: 'log.png' },
  [BLOCK_TYPES.LEAVES]: { name: '樹葉', hardness: 0.4, icon: 'leaves.png' },
  [BLOCK_TYPES.PLANKS]: { name: '木板', hardness: 0.8, icon: 'planks.png' },
  [BLOCK_TYPES.SAND]: { name: '沙子', hardness: 0.6, icon: 'sand.png' },
  [BLOCK_TYPES.BRICK]: { name: '磚塊', hardness: 2.0, icon: 'brick.png' },
};

export class VoxelWorld {
  constructor() {
    this.size = WORLD_SIZE;
    this.data = new Uint8Array(TOTAL_VOXELS);
    this.listeners = [];
  }

  getIndex(x, y, z) {
    if (!this.inBounds(x, y, z)) return -1;
    return x + this.size * (z + this.size * y);
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.size &&
           y >= 0 && y < this.size &&
           z >= 0 && z < this.size;
  }

  getVoxel(x, y, z) {
    const idx = this.getIndex(Math.floor(x), Math.floor(y), Math.floor(z));
    if (idx === -1) return BLOCK_TYPES.AIR;
    return this.data[idx];
  }

  setVoxel(x, y, z, id) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const idx = this.getIndex(ix, iy, iz);
    if (idx === -1) return false;

    const oldId = this.data[idx];
    if (oldId === id) return false;

    this.data[idx] = id;
    this.notifyChange(ix, iy, iz, id, oldId);
    return true;
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyChange(x, y, z, newId, oldId) {
    for (const cb of this.listeners) {
      cb(x, y, z, newId, oldId);
    }
  }

  /**
   * 初始化生成預設浮空島嶼地形
   */
  generateDefaultIsland() {
    this.data.fill(BLOCK_TYPES.AIR);

    const centerX = 16;
    const centerZ = 16;
    const baseRadius = 11;
    const surfaceY = 14;

    // 1. 生成島嶼主體（圓形錐體倒立向下）
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= baseRadius) {
          // 島嶼厚度隨邊緣變薄
          const depth = Math.floor((1 - dist / (baseRadius + 1)) * 6) + 1;
          const top = surfaceY;
          const bottom = Math.max(2, top - depth);

          for (let y = bottom; y <= top; y++) {
            if (y === top) {
              // 頂層為草地或步道
              if (dist < 4 && Math.abs(dx) <= 1) {
                this.setVoxel(x, y, z, BLOCK_TYPES.PLANKS);
              } else if (dist > 8 && dist < 10 && (x + z) % 3 === 0) {
                this.setVoxel(x, y, z, BLOCK_TYPES.SAND);
              } else {
                this.setVoxel(x, y, z, BLOCK_TYPES.GRASS);
              }
            } else if (y >= top - 2) {
              // 草地下一到二層為泥土
              this.setVoxel(x, y, z, BLOCK_TYPES.DIRT);
            } else {
              // 更深層為石頭
              this.setVoxel(x, y, z, BLOCK_TYPES.STONE);
            }
          }
        }
      }
    }

    // 2. 在島嶼上種植一顆樹木
    const treeX = 12;
    const treeZ = 12;
    const treeBaseY = surfaceY + 1;
    const trunkHeight = 4;

    // 樹幹 (Log)
    for (let y = treeBaseY; y < treeBaseY + trunkHeight; y++) {
      this.setVoxel(treeX, y, treeZ, BLOCK_TYPES.LOG);
    }

    // 樹葉 (Leaves)
    const leafTopY = treeBaseY + trunkHeight;
    for (let lx = treeX - 2; lx <= treeX + 2; lx++) {
      for (let lz = treeZ - 2; lz <= treeZ + 2; lz++) {
        for (let ly = leafTopY - 1; ly <= leafTopY + 1; ly++) {
          const ldist = Math.abs(lx - treeX) + Math.abs(lz - treeZ) + Math.abs(ly - leafTopY);
          if (ldist <= 3 && this.getVoxel(lx, ly, lz) === BLOCK_TYPES.AIR) {
            this.setVoxel(lx, ly, lz, BLOCK_TYPES.LEAVES);
          }
        }
      }
    }
    // 樹頂單個樹葉
    this.setVoxel(treeX, leafTopY + 2, treeZ, BLOCK_TYPES.LEAVES);

    // 3. 放置一個小磚塊建築基礎供玩家測試石頭/磚塊硬度
    for (let bx = 18; bx <= 20; bx++) {
      for (let bz = 18; bz <= 20; bz++) {
        this.setVoxel(bx, surfaceY + 1, bz, BLOCK_TYPES.BRICK);
      }
    }
    // 磚台上面放一塊石頭
    this.setVoxel(19, surfaceY + 2, 19, BLOCK_TYPES.STONE);
  }

  /**
   * 序列化為二進位 Base64 字串供 LocalStorage 儲存
   */
  serialize() {
    let binary = '';
    const bytes = this.data;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 反序列化
   */
  deserialize(base64Str) {
    try {
      const binary = atob(base64Str);
      if (binary.length !== TOTAL_VOXELS) return false;
      for (let i = 0; i < TOTAL_VOXELS; i++) {
        this.data[i] = binary.charCodeAt(i);
      }
      return true;
    } catch (e) {
      console.warn('Failed to deserialize world data:', e);
      return false;
    }
  }
}

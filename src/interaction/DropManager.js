/**
 * DropManager.js - 掉落物生成、物理墜落旋轉與磁吸拾取 (STEP 2 & STEP 3)
 */
import * as THREE from 'three';
import { BLOCK_TYPES, WORLD_SIZE } from '../world/VoxelWorld.js';

export class DropManager {
  constructor(scene, voxelWorld, inventory, mesherMaterials) {
    this.scene = scene;
    this.voxelWorld = voxelWorld;
    this.inventory = inventory;
    this.materials = mesherMaterials;

    this.drops = []; // 活躍掉落物陣列
    this.boxGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  }

  /**
   * 方塊破壞時於中心彈出縮小版同種類方塊 (STEP 2)
   */
  spawnDrop(x, y, z, blockId) {
    if (blockId === BLOCK_TYPES.AIR) return;

    // 依據方塊種類取得正確的六面材質
    const blockMat = this.getBlockMaterials(blockId);
    const mesh = new THREE.Mesh(this.boxGeometry, blockMat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const drop = {
      mesh,
      blockId,
      position: mesh.position,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        3.2, // 初始向上彈出初速度
        (Math.random() - 0.5) * 1.6
      ),
      isGrounded: false,
      isAttracting: false,
      lifetime: 0
    };

    this.drops.push(drop);
  }

  getBlockMaterials(blockId) {
    const m = this.materials;
    switch (blockId) {
      case BLOCK_TYPES.GRASS:
        // +X, -X, +Y, -Y, +Z, -Z
        return [m[1], m[1], m[0], m[2], m[1], m[1]];
      case BLOCK_TYPES.LOG:
        return [m[5], m[5], m[4], m[4], m[5], m[5]];
      case BLOCK_TYPES.DIRT:
        return m[2];
      case BLOCK_TYPES.STONE:
        return m[3];
      case BLOCK_TYPES.LEAVES:
        return m[6];
      case BLOCK_TYPES.PLANKS:
        return m[7];
      case BLOCK_TYPES.SAND:
        return m[8];
      case BLOCK_TYPES.BRICK:
        return m[9];
      default:
        return m[2];
    }
  }

  /**
   * 物理運動與拾取檢測 (STEP 2 & STEP 3)
   */
  update(delta, playerPosition) {
    const gravity = -18.0;
    const playerCenter = new THREE.Vector3(
      playerPosition.x,
      playerPosition.y + 0.8,
      playerPosition.z
    );

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.lifetime += delta;

      const dist = drop.position.distanceTo(playerCenter);

      // --- STEP 3 撿起來邏輯 ---
      // 規範：不可以站在 3 格外被撿起；走到旁邊 (< 1.8 格) 飛到身上
      if (dist <= 1.8) {
        drop.isAttracting = true;
      }

      if (drop.isAttracting && dist <= 3.0) {
        // 平滑飛向玩家身上
        drop.position.lerp(playerCenter, 7.5 * delta);

        // 觸碰玩家中心 (< 0.35 格) 視為成功拾取
        if (dist <= 0.35) {
          this.inventory.addItem(drop.blockId, 1); // 快捷欄數字 +1
          this.removeDrop(i);
          continue;
        }
      } else {
        // 若超出 3 格，取消吸引
        if (dist > 3.0) {
          drop.isAttracting = false;
        }

        // --- STEP 2 物理掉落與旋轉 ---
        // 慢速自轉
        drop.mesh.rotation.y += 1.8 * delta;

        if (!drop.isGrounded) {
          drop.velocity.y += gravity * delta;
          drop.position.x += drop.velocity.x * delta;
          drop.position.z += drop.velocity.z * delta;
          drop.position.y += drop.velocity.y * delta;

          // 體素地面碰撞檢測
          const bx = Math.floor(drop.position.x);
          const by = Math.floor(drop.position.y - 0.14); // 腳底接觸面
          const bz = Math.floor(drop.position.z);

          if (this.voxelWorld.getVoxel(bx, by, bz) !== BLOCK_TYPES.AIR) {
            // 平穩停在地表上，嚴禁穿過地面或懸浮在空中
            drop.position.y = by + 1.0 + 0.14;
            drop.velocity.set(0, 0, 0);
            drop.isGrounded = true;
          }
        }
      }
    }
  }

  removeDrop(index) {
    const drop = this.drops[index];
    this.scene.remove(drop.mesh);
    drop.mesh.geometry.dispose();
    this.drops.splice(index, 1);
  }

  clearAll() {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.removeDrop(i);
    }
  }
}

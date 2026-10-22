/**
 * MiningSystem.js - 方塊瞄準、長按挖掘與 16×16 裂痕動畫 (STEP 1)
 */
import * as THREE from 'three';
import { BLOCK_TYPES, BLOCK_INFO, WORLD_SIZE } from '../world/VoxelWorld.js';

export class MiningSystem {
  constructor(scene, camera, voxelWorld, onBlockDestroyed) {
    this.scene = scene;
    this.camera = camera;
    this.voxelWorld = voxelWorld;
    this.onBlockDestroyed = onBlockDestroyed;

    this.maxReach = 4.5;
    this.isMining = false;
    this.miningTime = 0;
    this.targetVoxel = null; // { x, y, z, blockId, normal }
    this.overrideTarget = null; // 支援測試與指定目標覆蓋

    // 10 階 16×16 破壞裂痕貼圖
    this.crackTextures = [];
    this.initCrackTextures();

    // 選取外框 (Wireframe)
    this.wireframeBox = this.createWireframeBox();
    this.scene.add(this.wireframeBox);

    // 裂痕覆蓋 Mesh (稍微放大，貼在方塊表面)
    this.crackMesh = this.createCrackMesh();
    this.scene.add(this.crackMesh);

    this.initListeners();
  }

  initCrackTextures() {
    const loader = new THREE.TextureLoader();
    for (let i = 0; i <= 9; i++) {
      const tex = loader.load(`assets/sky-island-assets/textures/16px/destroy_stage_${i}.png`);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      this.crackTextures.push(tex);
    }
  }

  createWireframeBox() {
    const geom = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(geom);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 })
    );
    line.visible = false;
    return line;
  }

  createCrackMesh() {
    const geom = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    return mesh;
  }

  initListeners() {
    window.addEventListener('mousedown', (e) => {
      // 0: 左鍵 (挖掘)
      if (e.button === 0 && document.pointerLockElement) {
        this.isMining = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        // 放開左鍵 → 立即重置裂痕與進度 (STEP 1: 挖到一半放開，裂痕不見要從頭挖)
        this.cancelMining();
      }
    });
  }

  cancelMining() {
    this.isMining = false;
    this.miningTime = 0;
    this.crackMesh.visible = false;
  }

  /**
   * 透過 3D 體素射線步進 (DDA Fast Voxel Traversal) 尋找瞄準的方塊
   */
  raycastVoxel() {
    const rayOrigin = this.camera.position;
    const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

    let x = Math.floor(rayOrigin.x);
    let y = Math.floor(rayOrigin.y);
    let z = Math.floor(rayOrigin.z);

    const stepX = rayDir.x > 0 ? 1 : -1;
    const stepY = rayDir.y > 0 ? 1 : -1;
    const stepZ = rayDir.z > 0 ? 1 : -1;

    const tDeltaX = rayDir.x !== 0 ? Math.abs(1 / rayDir.x) : Infinity;
    const tDeltaY = rayDir.y !== 0 ? Math.abs(1 / rayDir.y) : Infinity;
    const tDeltaZ = rayDir.z !== 0 ? Math.abs(1 / rayDir.z) : Infinity;

    let tMaxX = rayDir.x > 0 ? (x + 1 - rayOrigin.x) * tDeltaX : (rayOrigin.x - x) * tDeltaX;
    let tMaxY = rayDir.y > 0 ? (y + 1 - rayOrigin.y) * tDeltaY : (rayOrigin.y - y) * tDeltaY;
    let tMaxZ = rayDir.z > 0 ? (z + 1 - rayOrigin.z) * tDeltaZ : (rayOrigin.z - z) * tDeltaZ;

    let normal = { x: 0, y: 0, z: 0 };
    let dist = 0;

    while (dist <= this.maxReach) {
      const blockId = this.voxelWorld.getVoxel(x, y, z);
      if (blockId !== BLOCK_TYPES.AIR) {
        return { x, y, z, blockId, normal };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          dist = tMaxX;
          tMaxX += tDeltaX;
          normal = { x: -stepX, y: 0, z: 0 };
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          normal = { x: 0, y: 0, z: -stepZ };
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          dist = tMaxY;
          tMaxY += tDeltaY;
          normal = { x: 0, y: -stepY, z: 0 };
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
          normal = { x: 0, y: 0, z: -stepZ };
        }
      }
    }

    return null;
  }

  update(delta) {
    let hit = this.overrideTarget;
    if (!hit) {
      hit = this.raycastVoxel();
    } else {
      hit.blockId = this.voxelWorld.getVoxel(hit.x, hit.y, hit.z);
    }

    if (!hit || hit.blockId === BLOCK_TYPES.AIR) {
      this.wireframeBox.visible = false;
      this.cancelMining();
      this.targetVoxel = null;
      return;
    }

    // 目標更換時重置進度
    if (!this.targetVoxel ||
        this.targetVoxel.x !== hit.x ||
        this.targetVoxel.y !== hit.y ||
        this.targetVoxel.z !== hit.z) {
      this.targetVoxel = hit;
      if (!this.overrideTarget) {
        this.cancelMining();
      }
    }

    // 更新選取外框
    this.wireframeBox.visible = true;
    this.wireframeBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    // 處理挖掘邏輯 (STEP 1)
    if (this.isMining) {
      const info = BLOCK_INFO[hit.blockId] || { hardness: 1.0 };
      const requiredTime = info.hardness; // 泥土約 0.7 秒，石頭約 2.0 秒

      this.miningTime += delta;
      const progress = this.miningTime / requiredTime;

      // 段階式裂痕 (0~9 階)
      const stage = Math.min(9, Math.floor(progress * 10));
      this.crackMesh.visible = true;
      this.crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.crackMesh.material.map = this.crackTextures[stage];
      this.crackMesh.material.needsUpdate = true;

      // 挖掘完成
      if (this.miningTime >= requiredTime) {
        const destroyedX = hit.x;
        const destroyedY = hit.y;
        const destroyedZ = hit.z;
        const blockType = hit.blockId;

        // 破壞方塊
        this.voxelWorld.setVoxel(destroyedX, destroyedY, destroyedZ, BLOCK_TYPES.AIR);
        this.cancelMining();
        this.wireframeBox.visible = false;
        this.overrideTarget = null;

        // 觸發掉落回呼
        if (this.onBlockDestroyed) {
          this.onBlockDestroyed(destroyedX, destroyedY, destroyedZ, blockType);
        }
      }
    } else {
      this.crackMesh.visible = false;
    }
  }

  getTargetVoxel() {
    return this.overrideTarget || this.targetVoxel;
  }
}

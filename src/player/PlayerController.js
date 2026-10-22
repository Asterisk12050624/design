/**
 * PlayerController.js - 第一人稱視角、AABB 碰撞、走/跑/跳與 L 鍵趴下 (STEP 5)
 */
import * as THREE from 'three';
import { BLOCK_TYPES, WORLD_SIZE } from '../world/VoxelWorld.js';

export class PlayerController {
  constructor(camera, domElement, voxelWorld) {
    this.camera = camera;
    this.domElement = domElement;
    this.voxelWorld = voxelWorld;

    // 玩家世界座標（腳底中心位置）
    this.position = new THREE.Vector3(16, 16, 16);
    this.velocity = new THREE.Vector3(0, 0, 0);

    // 視角旋轉（歐拉角）
    this.pitch = 0; // 上下仰俯 (-PI/2 ~ PI/2)
    this.yaw = 0;   // 水平旋轉

    // 物理與尺寸規格
    this.width = 0.6;
    this.standingHeight = 1.8;
    this.standingEyeHeight = 1.6;

    this.proneHeight = 0.6;
    this.proneEyeHeight = 0.4;

    this.currentHeight = this.standingHeight;
    this.currentEyeHeight = this.standingEyeHeight;

    // 狀態標記
    this.isProne = false;
    this.isGrounded = false;
    this.isLocked = false;

    // 移動速度
    this.walkSpeed = 4.5;
    this.sprintSpeed = 7.0;
    this.proneSpeed = 2.2;
    this.jumpForce = 8.5;
    this.gravity = -24.0;

    // 按鍵狀態（前 W、後 S、左 A、右 D、跳躍 Space、奔跑 Shift、趴下 L）
    this.keys = {
      forward: false,  // W
      backward: false, // S
      left: false,     // A
      right: false,    // D
      jump: false,     // Space
      sprint: false    // Shift
    };

    // 外部風力偏移向量
    this.windDrift = new THREE.Vector2(0, 0);

    this.initListeners();
  }

  initListeners() {
    // 點擊鎖定滑鼠
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
    });

    // 滑鼠視角轉動
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      // 限制視角仰俯角度
      const maxPitch = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    // 鍵盤輸入監聽
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    window.addEventListener('keyup', (e) => {
      this.handleKeyUp(e);
    });
  }

  handleKeyDown(e) {
    switch (e.code) {
      case 'KeyW':
        this.keys.forward = true;
        break;
      case 'KeyS':
        this.keys.backward = true;
        break;
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.jump = true;
        if (this.isGrounded && !this.isProne) {
          this.velocity.y = this.jumpForce;
          this.isGrounded = false;
        }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'KeyL':
        // 切換趴下狀態
        this.toggleProne();
        break;
    }
  }

  handleKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
        this.keys.forward = false;
        break;
      case 'KeyS':
        this.keys.backward = false;
        break;
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
    }
  }

  /**
   * 切換趴下 / 站立狀態（包含頭頂防卡檢測）
   */
  toggleProne() {
    if (!this.isProne) {
      // 趴下：碰撞高度降為 0.6，相機降為 0.4
      this.isProne = true;
      this.currentHeight = this.proneHeight;
      this.currentEyeHeight = this.proneEyeHeight;
    } else {
      // 欲站起：必須向上檢查頭頂空間是否有實體方塊阻擋
      if (this.canStandUp()) {
        this.isProne = false;
        this.currentHeight = this.standingHeight;
        this.currentEyeHeight = this.standingEyeHeight;
      } else {
        console.log('頭頂有方塊阻擋，強制保持趴下狀態！');
      }
    }
  }

  /**
   * 檢查站立時頭頂是否會穿模
   */
  canStandUp() {
    const halfW = this.width / 2;
    const minX = Math.floor(this.position.x - halfW);
    const maxX = Math.floor(this.position.x + halfW);
    const minZ = Math.floor(this.position.z - halfW);
    const maxZ = Math.floor(this.position.z + halfW);

    // 檢查從趴下高度到站立高度的空間
    const startY = Math.floor(this.position.y + this.proneHeight);
    const endY = Math.floor(this.position.y + this.standingHeight);

    for (let y = startY; y <= endY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.voxelWorld.getVoxel(x, y, z) !== BLOCK_TYPES.AIR) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * 每幀物理與控制器更新 (固定 30 FPS 時間步長)
   */
  update(delta) {
    // 1. 計算水平移動向量（依據 yaw）
    let speed = this.isProne
      ? this.proneSpeed
      : (this.keys.sprint ? this.sprintSpeed : this.walkSpeed);

    let moveX = 0;
    let moveZ = 0;

    if (this.keys.forward) moveZ -= 1;
    if (this.keys.backward) moveZ += 1;
    if (this.keys.left) moveX -= 1;
    if (this.keys.right) moveX += 1;

    // 歸一化
    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    // 旋轉至相機 Yaw 朝向
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    const worldMoveX = (moveX * cos - moveZ * sin) * speed;
    const worldMoveZ = (moveX * sin + moveZ * cos) * speed;

    // 疊加風力偏向向量 (Wind Drift)
    this.velocity.x = worldMoveX + this.windDrift.x;
    this.velocity.z = worldMoveZ + this.windDrift.y;

    // 重力
    this.velocity.y += this.gravity * delta;
    // 終端速度限制
    if (this.velocity.y < -30) this.velocity.y = -30;

    // 2. AABB 碰撞檢測與位移分離 (X, Y, Z 分離軸運算)
    this.moveWithCollision(delta);

    // 3. 虛空防護：掉落過低時自動重生於空島中心
    if (this.position.y < -8) {
      this.respawn();
    }

    // 4. 同步相機位置與旋轉
    this.camera.position.set(
      this.position.x,
      this.position.y + this.currentEyeHeight,
      this.position.z
    );

    const rotQuat = new THREE.Quaternion();
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    rotQuat.multiplyQuaternions(yawQuat, pitchQuat);
    this.camera.quaternion.copy(rotQuat);
  }

  /**
   * 軸分離 AABB 體素碰撞演算法
   */
  moveWithCollision(delta) {
    const halfW = this.width / 2;

    // --- Y 軸移動與碰撞 ---
    const dy = this.velocity.y * delta;
    this.position.y += dy;

    if (dy < 0) {
      // 往下墜落，檢查腳下
      const feetY = this.position.y;
      const minX = Math.floor(this.position.x - halfW + 0.05);
      const maxX = Math.floor(this.position.x + halfW - 0.05);
      const minZ = Math.floor(this.position.z - halfW + 0.05);
      const maxZ = Math.floor(this.position.z + halfW - 0.05);

      const checkY = Math.floor(feetY);
      let collided = false;

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.voxelWorld.getVoxel(x, checkY, z) !== BLOCK_TYPES.AIR) {
            collided = true;
            break;
          }
        }
        if (collided) break;
      }

      if (collided) {
        // 吸附於地面，嚴禁穿地
        this.position.y = checkY + 1.0;
        this.velocity.y = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else if (dy > 0) {
      // 往上跳躍，檢查頭頂天花板
      const headY = this.position.y + this.currentHeight;
      const minX = Math.floor(this.position.x - halfW + 0.05);
      const maxX = Math.floor(this.position.x + halfW - 0.05);
      const minZ = Math.floor(this.position.z - halfW + 0.05);
      const maxZ = Math.floor(this.position.z + halfW - 0.05);

      const checkY = Math.floor(headY);
      let collided = false;

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.voxelWorld.getVoxel(x, checkY, z) !== BLOCK_TYPES.AIR) {
            collided = true;
            break;
          }
        }
        if (collided) break;
      }

      if (collided) {
        this.position.y = checkY - this.currentHeight;
        this.velocity.y = 0;
      }
    }

    // --- X 軸移動與碰撞 ---
    const dx = this.velocity.x * delta;
    this.position.x += dx;
    if (this.isCollidingAt(this.position.x, this.position.y, this.position.z)) {
      // 碰撞還原並貼合
      this.position.x -= dx;
      this.velocity.x = 0;
    }

    // --- Z 軸移動與碰撞 ---
    const dz = this.velocity.z * delta;
    this.position.z += dz;
    if (this.isCollidingAt(this.position.x, this.position.y, this.position.z)) {
      this.position.z -= dz;
      this.velocity.z = 0;
    }
  }

  isCollidingAt(px, py, pz) {
    const halfW = this.width / 2;
    const minX = Math.floor(px - halfW + 0.05);
    const maxX = Math.floor(px + halfW - 0.05);
    const minY = Math.floor(py + 0.05);
    const maxY = Math.floor(py + this.currentHeight - 0.05);
    const minZ = Math.floor(pz - halfW + 0.05);
    const maxZ = Math.floor(pz + halfW - 0.05);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.voxelWorld.getVoxel(x, y, z) !== BLOCK_TYPES.AIR) {
            return true;
          }
        }
      }
    }
    return false;
  }

  respawn() {
    this.position.set(16, 17, 16);
    this.velocity.set(0, 0, 0);
  }

  setWindDrift(wx, wz) {
    this.windDrift.set(wx, wz);
  }
}

/**
 * TestRunner.js - VERIFY.md 各階段全自動化驗證測試套件
 */
import * as THREE from 'three';
import { BLOCK_TYPES, BLOCK_INFO, WORLD_SIZE } from '../world/VoxelWorld.js';
import { WEATHER_TYPES } from '../weather/WeatherManager.js';
import { StorageManager } from '../world/StorageManager.js';

export class TestRunner {
  constructor(app) {
    this.app = app;
    this.results = [];
  }

  async runAllTests(onProgress) {
    this.results = [];
    const app = this.app;
    const player = app.player;
    const world = app.voxelWorld;
    const inventory = app.inventory;
    const mining = app.miningSystem;
    const drops = app.dropManager;
    const weather = app.weather;

    console.log('%c=== 開始執行 VERIFY.md 驗證測試 ===', 'color: #3b82f6; font-weight: bold; font-size: 14px;');

    const testCase = async (id, name, fn) => {
      console.log(`[執行測試] ${id}: ${name}...`);
      const startTime = performance.now();
      try {
        await fn();
        const duration = Math.round(performance.now() - startTime);
        const res = { id, name, passed: true, duration, error: null };
        this.results.push(res);
        console.log(`%c  ✔ 通過 (${duration}ms)`, 'color: #10b981;');
        if (onProgress) onProgress(res);
      } catch (err) {
        const duration = Math.round(performance.now() - startTime);
        const res = { id, name, passed: false, duration, error: err.message };
        this.results.push(res);
        console.error(`%c  ✖ 失敗: ${err.message}`, 'color: #ef4444;');
        if (onProgress) onProgress(res);
      }
    };

    // ----------------------------------------------------
    // STEP 1: 挖方塊
    // ----------------------------------------------------
    await testCase('TC-01', 'STEP 1: 長按左鍵挖泥土，段階裂痕遞增，不到 1 秒方塊破壞', async () => {
      // 在測試位置設置一塊泥土
      const tx = 16, ty = 14, tz = 14;
      world.setVoxel(tx, ty, tz, BLOCK_TYPES.DIRT);

      // 模擬瞄準該方塊
      mining.overrideTarget = { x: tx, y: ty, z: tz, blockId: BLOCK_TYPES.DIRT, normal: { x: 0, y: 0, z: 1 } };
      mining.targetVoxel = mining.overrideTarget;
      mining.isMining = true;
      mining.miningTime = 0;

      // 逐步模擬幀更新，驗證段階裂痕 (0~9)
      const hardness = BLOCK_INFO[BLOCK_TYPES.DIRT].hardness;
      if (hardness >= 1.0) throw new Error(`泥土破壞時間應小於 1 秒，目前設定為 ${hardness} 秒`);

      let maxStageSeen = 0;
      const step = 0.05; // 50ms 一幀
      let elapsed = 0;

      while (elapsed < hardness + 0.15) {
        mining.update(step);
        elapsed += step;
        if (mining.crackMesh.visible) {
          const currentProgress = mining.miningTime / hardness;
          const stage = Math.min(9, Math.floor(currentProgress * 10));
          if (stage > maxStageSeen) maxStageSeen = stage;
        }
        if (world.getVoxel(tx, ty, tz) === BLOCK_TYPES.AIR) {
          break;
        }
      }

      mining.overrideTarget = null;

      if (world.getVoxel(tx, ty, tz) !== BLOCK_TYPES.AIR) {
        throw new Error('泥土方塊在累計時間達到後未被破壞！');
      }
      if (elapsed >= 1.0) {
        throw new Error(`泥土破壞時間耗時 ${elapsed.toFixed(2)} 秒，超過 1 秒限制！`);
      }
      if (maxStageSeen < 5) {
        throw new Error(`裂痕階段未正常遞增 (最高僅見 stage ${maxStageSeen})`);
      }
    });

    await testCase('TC-02', 'STEP 1: 挖石頭比泥土久，大約需要 2 秒破壞', async () => {
      const tx = 16, ty = 14, tz = 14;
      world.setVoxel(tx, ty, tz, BLOCK_TYPES.STONE);

      mining.overrideTarget = { x: tx, y: ty, z: tz, blockId: BLOCK_TYPES.STONE, normal: { x: 0, y: 0, z: 1 } };
      mining.targetVoxel = mining.overrideTarget;
      mining.isMining = true;
      mining.miningTime = 0;

      const hardness = BLOCK_INFO[BLOCK_TYPES.STONE].hardness;
      if (hardness < 1.8 || hardness > 2.2) {
        throw new Error(`石頭硬度設定應約為 2 秒，目前為 ${hardness} 秒`);
      }

      // 模擬經過 1 秒（不應該破壞）
      mining.update(1.0);
      if (world.getVoxel(tx, ty, tz) === BLOCK_TYPES.AIR) {
        mining.overrideTarget = null;
        throw new Error('石頭在 1 秒時被破壞了，應該比泥土久 (約 2 秒)！');
      }

      // 再經過 1.05 秒（總計 2.05 秒，應該剛好破壞）
      mining.update(1.05);
      const isDestroyed = (world.getVoxel(tx, ty, tz) === BLOCK_TYPES.AIR);
      mining.overrideTarget = null;

      if (!isDestroyed) {
        throw new Error('石頭在 2.05 秒後未被成功破壞！');
      }
    });

    await testCase('TC-03', 'STEP 1: 挖到一半放開，裂痕立即消失且需從頭挖', async () => {
      const tx = 16, ty = 14, tz = 14;
      world.setVoxel(tx, ty, tz, BLOCK_TYPES.STONE);

      mining.overrideTarget = { x: tx, y: ty, z: tz, blockId: BLOCK_TYPES.STONE, normal: { x: 0, y: 0, z: 1 } };
      mining.targetVoxel = mining.overrideTarget;
      mining.isMining = true;
      mining.miningTime = 0;

      // 挖 1 秒 (50%)
      mining.update(1.0);
      const wasCrackVisible = mining.crackMesh.visible;
      if (!wasCrackVisible) {
        mining.overrideTarget = null;
        throw new Error('挖掘中未顯示裂痕覆蓋層！');
      }

      // 放開左鍵
      mining.cancelMining();

      if (mining.crackMesh.visible) {
        mining.overrideTarget = null;
        throw new Error('放開左鍵後裂痕依然殘留！');
      }
      if (mining.miningTime !== 0) {
        mining.overrideTarget = null;
        throw new Error(`放開後進度未重置，殘留值：${mining.miningTime}`);
      }

      mining.overrideTarget = null;
    });

    await testCase('TC-04', 'STEP 1: 嚴格禁止只點一下方塊就不見', async () => {
      const tx = 16, ty = 14, tz = 14;
      world.setVoxel(tx, ty, tz, BLOCK_TYPES.DIRT);

      mining.overrideTarget = { x: tx, y: ty, z: tz, blockId: BLOCK_TYPES.DIRT, normal: { x: 0, y: 0, z: 1 } };
      mining.targetVoxel = mining.overrideTarget;
      mining.isMining = true;
      mining.miningTime = 0;

      // 單擊（模擬僅 0.05 秒）立即放開
      mining.update(0.05);
      mining.cancelMining();
      mining.overrideTarget = null;

      if (world.getVoxel(tx, ty, tz) === BLOCK_TYPES.AIR) {
        throw new Error('❌ 違規：單擊滑鼠左鍵方塊竟然瞬間消失破壞了！');
      }
    });

    // ----------------------------------------------------
    // STEP 2: 掉出來
    // ----------------------------------------------------
    await testCase('TC-05', 'STEP 2: 方塊破壞彈出同種類小方塊，受重力落地不浮空不穿地', async () => {
      drops.clearAll();
      const tx = 16, ty = 15, tz = 16;
      // 確保下方有實體方塊當地面
      world.setVoxel(tx, 14, tz, BLOCK_TYPES.STONE);

      // 生成掉落物
      drops.spawnDrop(tx, ty, tz, BLOCK_TYPES.STONE);
      if (drops.drops.length !== 1) throw new Error('未成功生成掉落物實體！');

      const drop = drops.drops[0];
      if (drop.blockId !== BLOCK_TYPES.STONE) throw new Error('掉落物種類與破壞方塊不一致！');
      if (drop.velocity.y <= 0) throw new Error('掉落物未賦予向上彈出之初速度！');

      // 模擬物理下落 (步進 2 秒)
      for (let f = 0; f < 60; f++) {
        drops.update(1 / 30, new THREE.Vector3(0, 0, 0)); // 玩家在遙遠處
      }

      if (!drop.isGrounded) throw new Error('❌ 違規：掉落物無故懸浮在半空中未落地！');
      // 地面方塊頂部為 Y=15，掉落物中心應為 15 + 0.14 = 15.14
      if (drop.position.y < 14.9) {
        throw new Error(`❌ 違規：掉落物穿過了地面！當前 Y 坐標: ${drop.position.y}`);
      }
    });

    // ----------------------------------------------------
    // STEP 3: 撿起來
    // ----------------------------------------------------
    await testCase('TC-06', 'STEP 3: 嚴格禁止在 3 格外被撿起來', async () => {
      drops.clearAll();
      const dropPos = new THREE.Vector3(16, 15.14, 16);
      drops.spawnDrop(dropPos.x, dropPos.y, dropPos.z, BLOCK_TYPES.BRICK);

      const drop = drops.drops[0];
      drop.isGrounded = true;

      // 玩家站在 4 格距離處
      const farPlayerPos = new THREE.Vector3(16 + 4.0, 15, 16);

      const initialCount = inventory.slots[0].count;
      for (let f = 0; f < 30; f++) {
        drops.update(1 / 30, farPlayerPos);
      }

      if (drops.drops.length === 0) {
        throw new Error('❌ 違規：玩家站在 4 格外 (超過 3 格)，掉落物竟然被吸附撿起了！');
      }
    });

    await testCase('TC-07', 'STEP 3: 走到旁邊 (< 1.8 格) 飛到身上，快捷欄對應數字 +1', async () => {
      drops.clearAll();
      const targetBlock = BLOCK_TYPES.BRICK;
      drops.spawnDrop(16, 15, 16, targetBlock);

      // 找出該物品在背包中的數量
      let slotIdx = inventory.slots.findIndex(s => s.blockId === targetBlock);
      const prevCount = slotIdx >= 0 ? inventory.slots[slotIdx].count : 0;

      // 玩家走近至 1.2 格處
      const nearPlayerPos = new THREE.Vector3(16, 15, 16 + 1.2);

      // 模擬吸附與拾取
      for (let f = 0; f < 30; f++) {
        drops.update(1 / 30, nearPlayerPos);
      }

      slotIdx = inventory.slots.findIndex(s => s.blockId === targetBlock);
      const newCount = slotIdx >= 0 ? inventory.slots[slotIdx].count : 0;

      if (newCount !== prevCount + 1) {
        throw new Error(`拾取後數字未 +1！原值: ${prevCount}, 新值: ${newCount}`);
      }
      if (drops.drops.length !== 0) {
        throw new Error('拾取後掉落物未從場景中移除！');
      }
    });

    // ----------------------------------------------------
    // STEP 4: 放回去與閉環守恆
    // ----------------------------------------------------
    await testCase('TC-08', 'STEP 4: 右鍵放出一格方塊，數字 -1，防卡判定', async () => {
      // 確保手持有效方塊
      inventory.setActiveIndex(0);
      const activeSlot = inventory.getActiveSlot();
      const originalCount = activeSlot.count;

      const placeTarget = { x: 16, y: 14, z: 16, normal: { x: 0, y: 1, z: 0 } };
      app.miningSystem.targetVoxel = placeTarget;

      // 確保目標格是空氣
      world.setVoxel(16, 15, 16, BLOCK_TYPES.AIR);
      // 確保玩家不站在 (16, 15, 16)
      player.position.set(12, 15, 12);

      const placed = app.placementSystem.placeBlock();
      if (!placed) throw new Error('正常條件下未能成功放置方塊！');

      if (world.getVoxel(16, 15, 16) !== activeSlot.blockId) {
        throw new Error('放置位置未產生對應方塊！');
      }
      if (activeSlot.count !== originalCount - 1) {
        throw new Error(`放置後數字未 -1！原值: ${originalCount}, 現值: ${activeSlot.count}`);
      }
    });

    await testCase('TC-09', 'STEP 4: 嚴格禁止數量為 0 時還放得出來', async () => {
      // 將最後一格數量設為 0
      inventory.setActiveIndex(8);
      const slot = inventory.getActiveSlot();
      slot.count = 0;
      slot.blockId = BLOCK_TYPES.STONE;

      const placeTarget = { x: 16, y: 14, z: 16, normal: { x: 0, y: 1, z: 0 } };
      app.miningSystem.targetVoxel = placeTarget;
      world.setVoxel(16, 15, 16, BLOCK_TYPES.AIR);

      const placed = app.placementSystem.placeBlock();
      if (placed || world.getVoxel(16, 15, 16) !== BLOCK_TYPES.AIR) {
        throw new Error('❌ 違規：方塊數量為 0 時竟然還能放得出來！');
      }
    });

    await testCase('TC-10', '閉環驗證: 完整執行「挖 → 掉 → 撿 → 放」，數字完美回到原本初值', async () => {
      // 選取泥土格
      inventory.setActiveIndex(1);
      const slot = inventory.getActiveSlot();
      const initialCount = slot.count;

      const testX = 16, testY = 15, testZ = 16;
      world.setVoxel(testX, testY, testZ, slot.blockId);
      drops.clearAll();

      // 1. 挖掉方塊
      world.setVoxel(testX, testY, testZ, BLOCK_TYPES.AIR);
      // 2. 掉出來
      drops.spawnDrop(testX, testY, testZ, slot.blockId);

      // 3. 走近撿起來 (+1)
      for (let f = 0; f < 30; f++) {
        drops.update(1 / 30, new THREE.Vector3(testX, testY, testZ));
      }
      if (slot.count !== initialCount + 1) {
        throw new Error(`拾取後期望數字為 ${initialCount + 1}，實際為 ${slot.count}`);
      }

      // 4. 放回原處 (-1)
      player.position.set(testX + 2, testY, testZ);
      app.miningSystem.targetVoxel = { x: testX, y: testY - 1, z: testZ, normal: { x: 0, y: 1, z: 0 } };
      app.placementSystem.placeBlock();

      if (slot.count !== initialCount) {
        throw new Error(`❌ 違規：閉環循環後數字未能回到原本！原初值: ${initialCount}, 最終值: ${slot.count}`);
      }
    });

    // ----------------------------------------------------
    // STEP 5: 控制方向鍵、跳起來與趴下
    // ----------------------------------------------------
    await testCase('TC-11', 'STEP 5: 控制方向鍵前 W、後 S、左 A、右 D 嚴格配合玩家朝向位移', async () => {
      player.respawn();

      // 1. 測試轉動朝向 (Yaw = 90度)
      player.yaw = -Math.PI / 2; // 朝向 +X 軸

      const p0 = player.position.clone();
      player.keys.forward = true;
      player.update(0.2);
      player.keys.forward = false;

      // 視線朝 +X，按 W 應朝 +X 方向移動
      if (player.position.x - p0.x <= 0.2) {
        throw new Error('視角轉向右方後，按 W 前進未朝人朝向正前方 (+X) 移動！');
      }

      // 2. 測試按 S (後退)
      const p1 = player.position.clone();
      player.keys.backward = true;
      player.update(0.2);
      player.keys.backward = false;
      if (player.position.x >= p1.x - 0.1) {
        throw new Error('按 S 後退未朝人朝向正後方 (-X) 移動！');
      }

      // 3. 測試按 D (向右橫移)
      const p2 = player.position.clone();
      player.keys.right = true;
      player.update(0.2);
      player.keys.right = false;
      if (player.position.z - p2.z <= 0.1) {
        throw new Error('按 D 向右未朝人朝向右方 (+Z) 移動！');
      }

      // 4. 測試按 A (向左橫移)
      const p3 = player.position.clone();
      player.keys.left = true;
      player.update(0.2);
      player.keys.left = false;
      if (player.position.z >= p3.z - 0.1) {
        throw new Error('按 A 向左未朝人朝向左方 (-Z) 移動！');
      }

      // 還原朝向
      player.yaw = 0;
    });

    await testCase('TC-12', 'STEP 5: 空白鍵跳一下，重力自然落下落地，不穿地不浮空', async () => {
      player.respawn();
      // 等待著地
      for (let f = 0; f < 30; f++) player.update(1 / 30);
      if (!player.isGrounded) throw new Error('角色未正確著地！');

      const groundY = player.position.y;

      // 跳躍
      player.velocity.y = player.jumpForce;
      player.isGrounded = false;
      player.update(0.1);

      if (player.position.y <= groundY) throw new Error('跳躍後 Y 座標未上升！');

      // 模擬重力下落
      for (let f = 0; f < 60; f++) player.update(1 / 30);

      if (!player.isGrounded) throw new Error('跳躍後角色未重新平穩落回地面！');
      if (Math.abs(player.position.y - groundY) > 0.1) {
        throw new Error(`落地後位置異常 (期望: ${groundY}, 實際: ${player.position.y})`);
      }
    });

    await testCase('TC-13', 'STEP 5: 按下 L 鍵趴下 (高 0.6，視角 0.4)，趴著時可正常走動', async () => {
      if (player.isProne) player.toggleProne(); // 確保先站立

      // 按 L 趴下
      player.toggleProne();
      if (!player.isProne) throw new Error('按下 L 鍵未能進入趴下狀態！');
      if (player.currentHeight !== 0.6) throw new Error(`趴下碰撞高度應為 0.6，實際為 ${player.currentHeight}`);
      if (player.currentEyeHeight !== 0.4) throw new Error(`趴下相機眼高應為 0.4，實際為 ${player.currentEyeHeight}`);

      // 趴著移動
      const startPronePos = player.position.clone();
      player.keys.forward = true;
      for (let f = 0; f < 15; f++) player.update(1 / 30);
      player.keys.forward = false;

      const proneDist = player.position.distanceTo(startPronePos);
      if (proneDist <= 0.2) throw new Error('趴下狀態下無法正常走動 (匍匐前進)！');

      // 恢復站立
      player.toggleProne();
      if (player.isProne) throw new Error('未能正常恢復站立狀態！');
    });

    await testCase('TC-14', 'STEP 5: 站起保護：頭頂有方塊阻擋時強制保持趴下狀態', async () => {
      // 在角色上方 1 格處放置實體方塊當作低矮天花板
      const px = Math.floor(player.position.x);
      const py = Math.floor(player.position.y);
      const pz = Math.floor(player.position.z);

      // 先進入趴下
      if (!player.isProne) player.toggleProne();

      // 在頭頂上方放磚塊 (py + 1 是趴下的頭頂之上，站立則需要 py + 2 空間)
      world.setVoxel(px, py + 1, pz, BLOCK_TYPES.BRICK);

      // 嘗試按 L 站起來
      player.toggleProne();

      // 檢驗是否被擋住強制維持趴下
      const stillProne = player.isProne;

      // 清理測試方塊
      world.setVoxel(px, py + 1, pz, BLOCK_TYPES.AIR);

      if (!stillProne) {
        throw new Error('❌ 違規：頭頂有方塊阻擋時，角色竟然穿模站起來了！');
      }
    });

    // ----------------------------------------------------
    // 天氣與偏向物理
    // ----------------------------------------------------
    await testCase('TC-15', '動態天氣：強風 (Windy) 產生全域風向向量，令角色走動偏向風向', async () => {
      weather.setWeather(WEATHER_TYPES.WINDY);

      if (weather.windVector.length() <= 0) {
        throw new Error('強風天氣下未產生風力向量！');
      }

      player.respawn();
      player.keys.forward = true; // 正前方走動
      player.update(0.3);
      player.keys.forward = false;

      // 檢驗是否受到 X 軸風向側推
      if (Math.abs(player.velocity.x) <= 0.05 && Math.abs(player.windDrift.x) <= 0.05) {
        throw new Error('強風天氣下角色移動未疊加風向側推力！');
      }

      // 切換回晴天
      weather.setWeather(WEATHER_TYPES.CLEAR);
    });

    // ----------------------------------------------------
    // 世界持久化 (LocalStorage)
    // ----------------------------------------------------
    await testCase('TC-16', '世界持久化：變更方塊後 LocalStorage 成功保存並可正確還原', async () => {
      const testX = 10, testY = 14, testZ = 10;
      world.setVoxel(testX, testY, testZ, BLOCK_TYPES.SAND);

      // 保存
      const saved = StorageManager.save(world);
      if (!saved) throw new Error('LocalStorage 保存失敗！');

      // 建立全新世界實例並還原
      const cloneWorld = new (world.constructor)();
      const loaded = StorageManager.load(cloneWorld);
      if (!loaded) throw new Error('LocalStorage 讀取失敗！');

      if (cloneWorld.getVoxel(testX, testY, testZ) !== BLOCK_TYPES.SAND) {
        throw new Error('讀取後的體素資料與保存前不一致！');
      }
    });

    // ----------------------------------------------------
    // 30 FPS 約束
    // ----------------------------------------------------
    await testCase('TC-17', '技術約束：鎖定 30 FPS 主迴圈 (單幀間隔為 33.33ms)', async () => {
      const loop = app.loop;
      if (loop.targetFps !== 30) throw new Error(`目標幀率非 30 FPS，目前為 ${loop.targetFps}`);
      const expectedInterval = 1000 / 30;
      if (Math.abs(loop.frameInterval - expectedInterval) > 0.1) {
        throw new Error(`單幀間隔異常：${loop.frameInterval}`);
      }
    });

    console.log('%c=== 全部 VERIFY.md 驗證測試完成 ===', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
    return this.results;
  }
}

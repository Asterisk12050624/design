/**
 * main.js - 遊戲進入點與系統模組裝配
 */
import * as THREE from 'three';
import { GameLoop } from './core/GameLoop.js';
import { VoxelWorld, BLOCK_TYPES, BLOCK_INFO } from './world/VoxelWorld.js';
import { WorldMesher } from './world/WorldMesher.js';
import { StorageManager } from './world/StorageManager.js';
import { PlayerController } from './player/PlayerController.js';
import { Inventory } from './interaction/Inventory.js';
import { MiningSystem } from './interaction/MiningSystem.js';
import { DropManager } from './interaction/DropManager.js';
import { PlacementSystem } from './interaction/PlacementSystem.js';
import { WeatherManager, WEATHER_LABELS } from './weather/WeatherManager.js';
import { TestRunner } from './test/TestRunner.js';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.initThree();

    // 1. 世界資料與存檔
    this.voxelWorld = new VoxelWorld();
    if (StorageManager.hasSave()) {
      console.log('讀取本機存檔世界...');
      StorageManager.load(this.voxelWorld);
    } else {
      console.log('生成預設空島地形...');
      this.voxelWorld.generateDefaultIsland();
      StorageManager.save(this.voxelWorld);
    }

    // 2. 體素網格渲染 (面剔除)
    this.worldMesher = new WorldMesher(this.voxelWorld);
    const worldMesh = this.worldMesher.buildMesh();
    this.scene.add(worldMesh);

    // 當體素變更時重構網格並自動存檔
    this.voxelWorld.onChange(() => {
      this.worldMesher.buildMesh();
      StorageManager.save(this.voxelWorld);
    });

    // 3. 玩家控制器 (STEP 5 移動/跳躍/趴下)
    this.player = new PlayerController(this.camera, this.renderer.domElement, this.voxelWorld);

    // 4. 物品欄與方塊互動 (STEP 1 ~ STEP 4)
    this.inventory = new Inventory();
    this.dropManager = new DropManager(
      this.scene,
      this.voxelWorld,
      this.inventory,
      this.worldMesher.materials
    );

    // 挖掘系統 (STEP 1 破壞後觸發 STEP 2 彈出掉落物)
    this.miningSystem = new MiningSystem(
      this.scene,
      this.camera,
      this.voxelWorld,
      (x, y, z, blockId) => {
        this.dropManager.spawnDrop(x, y, z, blockId);
      }
    );

    // 放置系統 (STEP 4)
    this.placementSystem = new PlacementSystem(
      this.voxelWorld,
      this.inventory,
      this.player
    );
    this.placementSystem.setMiningSystem(this.miningSystem);

    // 5. 動態天氣系統 (雨/雪/風偏向/冰雹)
    this.weather = new WeatherManager(this.scene, this.player);

    // 6. 測試執行器
    this.testRunner = new TestRunner(this);
    window.runVerifyTests = () => this.executeTests();

    // 7. UI HUD 綁定
    this.initUI();

    // 8. 30 FPS 固定主迴圈
    this.loop = new GameLoop(
      (delta) => this.update(delta),
      () => this.render(),
      30
    );

    this.loop.start();

    // 檢查 URL query 參數是否要自動觸發測試
    if (new URLSearchParams(window.location.search).get('test')) {
      setTimeout(() => this.executeTests(), 800);
    }
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bfe0f4');

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // 像素風格無需抗鋸齒
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;

    // 光照系統
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.85);
    dirLight.position.set(24, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    this.scene.add(dirLight);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initUI() {
    // 快捷欄 DOM 構建
    const hotbarContainer = document.getElementById('hotbar-container');
    hotbarContainer.innerHTML = '';

    for (let i = 0; i < this.inventory.slotCount; i++) {
      const slotDiv = document.createElement('div');
      slotDiv.className = `hotbar-slot ${i === 0 ? 'active' : ''}`;
      slotDiv.dataset.index = i;

      slotDiv.innerHTML = `
        <span class="slot-num">${i + 1}</span>
        <img src="" style="display: none;" alt="slot">
        <span class="slot-count"></span>
      `;

      slotDiv.addEventListener('click', () => {
        this.inventory.setActiveIndex(i);
      });

      hotbarContainer.appendChild(slotDiv);
    }

    // 快捷欄狀態監聽
    this.inventory.onChange((inv) => {
      const slots = hotbarContainer.querySelectorAll('.hotbar-slot');
      slots.forEach((slotDiv, idx) => {
        const item = inv.slots[idx];
        const img = slotDiv.querySelector('img');
        const countSpan = slotDiv.querySelector('.slot-count');

        if (idx === inv.activeIndex) {
          slotDiv.classList.add('active');
        } else {
          slotDiv.classList.remove('active');
        }

        if (item && item.count > 0 && item.blockId !== BLOCK_TYPES.AIR) {
          const info = BLOCK_INFO[item.blockId];
          img.src = `assets/sky-island-assets/icons/${info.icon}`;
          img.style.display = 'block';
          countSpan.textContent = item.count;
        } else {
          img.style.display = 'none';
          countSpan.textContent = '';
        }
      });
    });

    // 數字鍵 1~9 與滾輪切換快捷欄
    window.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        this.inventory.setActiveIndex(idx);
      }
    });

    window.addEventListener('wheel', (e) => {
      if (!this.player.isLocked) return;
      let next = this.inventory.activeIndex + (e.deltaY > 0 ? 1 : -1);
      if (next < 0) next = this.inventory.slotCount - 1;
      if (next >= this.inventory.slotCount) next = 0;
      this.inventory.setActiveIndex(next);
    });

    // 天氣標籤與切換按鈕
    const weatherLabel = document.getElementById('weather-label');
    const weatherBtn = document.getElementById('btn-weather');
    this.weather.onWeatherChanged = (type) => {
      weatherLabel.textContent = WEATHER_LABELS[type] || type;
    };
    weatherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.weather.toggleNextWeather();
    });

    // 重置世界按鈕
    const resetBtn = document.getElementById('btn-reset');
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('確定要將世界重置回初始島嶼嗎？所有建造將被還原。')) {
        StorageManager.clear();
        this.voxelWorld.generateDefaultIsland();
        this.worldMesher.buildMesh();
        this.dropManager.clearAll();
        this.player.respawn();
        console.log('世界已重置為初始狀態！');
      }
    });

    // 姿態指示標籤
    this.stanceLabel = document.getElementById('stance-label');

    // 開始/暫停覆蓋層
    const overlay = document.getElementById('overlay-screen');
    const startBtn = document.getElementById('btn-start');

    startBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      this.canvas.requestPointerLock();
    });

    // 測試面板相關事件
    const testModal = document.getElementById('test-modal');
    const runTestBtn = document.getElementById('btn-run-tests');
    const startTestBtn = document.getElementById('btn-start-test');
    const closeTestBtn = document.getElementById('btn-close-test');
    const retestBtn = document.getElementById('btn-retest');

    const openAndRunTests = (e) => {
      if (e) e.stopPropagation();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      overlay.style.display = 'none';
      testModal.style.display = 'flex';
      this.executeTests();
    };

    if (runTestBtn) runTestBtn.addEventListener('click', openAndRunTests);
    if (startTestBtn) startTestBtn.addEventListener('click', openAndRunTests);
    if (retestBtn) retestBtn.addEventListener('click', () => this.executeTests());
    if (closeTestBtn) closeTestBtn.addEventListener('click', () => {
      testModal.style.display = 'none';
      overlay.style.display = 'flex';
    });

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) {
        if (testModal.style.display !== 'flex') {
          overlay.style.display = 'flex';
        }
      } else {
        overlay.style.display = 'none';
        testModal.style.display = 'none';
      }
    });
  }

  async executeTests() {
    const listEl = document.getElementById('test-results-list');
    const summaryEl = document.getElementById('test-summary');
    if (!listEl) return;

    listEl.innerHTML = '<div style="color: #60a5fa; text-align: center; padding: 20px;">⚡ 正在執行 VERIFY.md 各階段測試...</div>';
    summaryEl.textContent = '測試進行中...';

    const items = [];

    const results = await this.testRunner.runAllTests((res) => {
      items.push(res);
      listEl.innerHTML = items.map(r => `
        <div class="test-item ${r.passed ? 'passed' : 'failed'}">
          <div>
            <strong>${r.id}</strong>: ${r.name}
            ${r.error ? `<div style="color: #f87171; font-size: 11px; margin-top: 4px;">❌ ${r.error}</div>` : ''}
          </div>
          <div class="test-status">
            ${r.passed ? `✔ 通過 (${r.duration}ms)` : '✖ 失敗'}
          </div>
        </div>
      `).join('');
      listEl.scrollTop = listEl.scrollHeight;
    });

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const isAllPassed = (passedCount === totalCount);

    summaryEl.innerHTML = `
      驗收結果：<span style="color: ${isAllPassed ? '#10b981' : '#ef4444'}; font-size: 14px;">
        ${passedCount} / ${totalCount} 項測試通過 (${Math.round((passedCount / totalCount) * 100)}%)
      </span>
    `;

    return results;
  }

  update(delta) {
    this.player.update(delta);
    this.miningSystem.update(delta);
    this.dropManager.update(delta, this.player.position);
    this.weather.update(delta);

    // 更新 HUD 狀態
    if (this.stanceLabel) {
      this.stanceLabel.textContent = this.player.isProne ? '姿態：趴下 🧎 (L鍵)' : '姿態：站立 🚶 (L鍵)';
    }

    const fpsEl = document.getElementById('fps-counter');
    if (fpsEl) {
      fpsEl.textContent = `FPS: ${this.loop.getFps()}`;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  window.app = new GameApp();
});

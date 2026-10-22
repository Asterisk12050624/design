# AI Agent 指引與協作規範 (AGENTS.md)

> **適用對象**：參與本專案開發、除錯、測試與重構的所有 AI Agent 與協同開發者。  
> **專案名稱**：Mini Voxel World (輕量級體素世界)  
> **核心參考文件**：  
> - 專案主題與規格：[BRIEF.md](file:///Users/a123/design2/BRIEF.md)  
> - 實作計畫與模組：[PLANS.v1.md](file:///Users/a123/design2/PLANS.v1.md)  
> - 驗證與驗收矩陣：[VERIFY.md](file:///Users/a123/design2/VERIFY.md)  

---

## 1. 核心憲章與開發原則 (Core Principles)

身為本專案的 AI 開發 Agent，你的角色是 **資深 Three.js 遊戲引擎與前端物理架構工程師**。在閱讀或產生任何程式碼時，必須嚴格遵守以下準則：

1. **極簡與效能優先**：專案目標為流暢運行於所有裝置的單人沙盒遊戲，代碼保持模組化（純 ES Modules，不依賴重型外部框架），嚴禁過度設計。
2. **閉環守恆檢驗**：方塊生命週期必須嚴格滿足「挖 $\rightarrow$ 掉 $\rightarrow$ 撿 $\rightarrow$ 放」的數量與行為守恆。
3. **無縫視覺保真**：完全依循復古 16×16 像素風格，嚴格設定 `THREE.NearestFilter`，不得引入抗鋸齒模糊。

---

## 2. 絕對不可違背的限制 (Immutable Constraints)

在實作任何模組時，下列硬性約束**絕對不可更動或妥協**：

| 約束項目 | 具體數值 / 規範 | 違規行為（嚴格禁止） |
| :--- | :--- | :--- |
| **渲染引擎** | **Three.js** (WebGL) | ❌ 引入 Babylon.js, PlayCanvas, Phaser 或 Unity WebGL |
| **目標幀率** | **鎖定 30 FPS** | ❌ 使用無限制的 60/144 FPS 原生 `requestAnimationFrame` 迴圈 |
| **世界維度** | **$32 \times 32 \times 32$ 格** (總計 32,768 體素) | ❌ 擴展至無限生成 Chunk、隨機無邊界地圖 |
| **材質解析度** | **16×16 像素**（NearestFilter） | ❌ 使用雙線性插值平滑貼圖，或私自改用高解析度材質 |
| **資源包來源** | **`assets/sky-island-assets/`** | ❌ 引入外部未授權的 Minecraft 官方材質或非指定貼圖 |
| **排除範疇** | **無多人、無打怪、無合成** | ❌ 建立 WebSocket/WebRTC 同步、怪物 AI 或工作台配方介面 |

---

## 3. 關鍵機制與實作法則 (Implementation Guidelines)

所有 Agent 必須依據以下實作指引撰寫代碼，避免常見踩坑：

### 3.1 渲染優化法則 (Draw Calls & Culling)
- **嚴禁建立 32,768 個個別 `THREE.Mesh`**。
- 必須採用 **面剔除 (Culled Meshing / BufferGeometry)** 或 **`THREE.InstancedMesh`**：
  - 僅為暴露於空氣的面建立頂點與索引。
  - 被 6 個實體方塊包覆的內部體素，其表面絕不送入 GPU 渲染。

### 3.2 角色控制器與 STEP 5（移動、跳躍與趴下）
- **視角鎖定**：採用 `PointerLockControls`，提供標準第一人稱體驗。
- **控制方向鍵**：
  - **前**：`W`
  - **後**：`S`
  - **左**：`A`
  - **右**：`D`
- **碰撞盒尺寸**：
  - **站立狀態**：AABB 寬度 0.6、高度 1.8（相機眼高 1.6）。
  - **趴下狀態 (`L` 鍵)**：AABB 寬度 0.6、高度縮小為 0.6（相機眼高降至 0.4）。
- **爬行與站立保護**：
  - 趴下時依然可以使用方向鍵 (W, S, A, D) 移動（匍匐前進）。
  - 欲解除趴下站立前，必須向上檢查頭頂空間是否有實體方塊阻擋；若被方塊卡住，**強制維持趴下狀態**，禁止穿模穿地。
- **地表吸附與重力**：跳躍與趴下狀態嚴禁穿透地面，亦不可浮於半空。

### 3.3 方塊循環系統 (STEP 1 ～ STEP 4)
- **STEP 1 挖方塊**：
  - 長按左鍵累計挖掘時間（泥土 $< 1$ 秒，石頭約 2 秒）。
  - 目標方塊表面貼附微放大的覆蓋層，切換 10 階裂痕（`destroy_stage_0.png` ～ `9.png`）。
  - 放開左鍵立即清除裂痕重置進度；**嚴禁單擊瞬間破壞**。
- **STEP 2 掉出來**：
  - 破壞完成瞬間，原處生成同類型迷你方塊（縮小尺寸，如 0.25 格），賦予初速度與緩慢自轉。
  - 掉落物受重力影響，平穩停在地表；**嚴禁卡入地面或無故懸浮在半空**。
- **STEP 3 撿起來**：
  - 玩家靠近至 1.8 格內時，掉落物平滑飛向玩家被拾取，快捷欄數字 **+1**。
  - **嚴禁在 3 格以外被拾取**。
- **STEP 4 放回去**：
  - 快捷欄選中方塊對準目標表面法線放置，數字 **−1**。
  - **嚴禁數字為 0 時放得出來**。
  - 防卡保護：若放置目標與玩家 AABB 碰撞盒相交，拒絕放置。

### 3.4 動態天氣系統 (Weather & Environment)
- **天氣狀態**：`Clear`, `Rain`, `Snow`, `Windy`, `Hail`。
- **強風 (Windy)**：
  - 維護二維風向向量 $\vec{W} = (w_x, w_z)$。
  - 角色移動時強制疊加風力位移，產生側向偏向手感。
- **冰雹 (Hail)**：
  - 快速下墜的小冰塊粒子特效與環境氛圍渲染。

### 3.5 世界持久化 (Persistence)
- 每次挖掘或放置方塊時，將 $32 \times 32 \times 32$ 變動寫入本機 `LocalStorage`。
- 頁面載入（F5 刷新）時先讀取本機存檔，若無存檔才初始化預設浮空島嶼。

---

## 4. 驗證與驗收協定 (Verification Protocol)

任何 Agent 在提交或宣布完成某一功能前，**必須對照 [VERIFY.md](file:///Users/a123/design2/VERIFY.md) 逐項確認**：

1. **STEP 1 ～ 5 全項目查核**：包括各操作的「正常行為」與「不可以的禁止行為」。
2. **閉環驗證**：執行完整「挖 $\rightarrow$ 掉 $\rightarrow$ 撿 $\rightarrow$ 放」，確保快捷欄數字完全回歸初始值。
3. **無報錯原則**：瀏覽器 Console 嚴禁出現 WebGL 警告、資源 404 或未捕獲的例外（Uncaught Exceptions）。

---

## 5. 檔案結構與模組權責表 (Codebase Organization)

```
design2/
├── BRIEF.md                 # 專案需求與功能規格定義（單一真相來源）
├── VERIFY.md                # 驗證測試矩陣與驗收標準
├── PLANS.v1.md              # 實作開發藍圖與階段性任務
├── AGENTS.md                # 本指引文件（AI Agent 協作守則）
├── index.html               # 遊戲進入點與 HUD 介面結構
├── styles.css               # 像素風 UI 樣式表
├── assets/
│   └── sky-island-assets/   # 官方素材包（atlas, cracks, icons, 16px textures）
└── src/
    ├── main.js              # 系統啟動與各子模組裝配
    ├── core/                # 30 FPS GameLoop 與 Three.js Engine
    ├── world/               # 體素資料庫、面剔除網格與存檔持久化
    ├── player/              # 角色狀態、第一人稱控制器與跳/趴 AABB 物理
    ├── interaction/         # 挖掘裂痕、掉落物、磁吸拾取、放方塊與快捷欄
    └── weather/             # 雨/雪/強風偏轉/冰雹天氣系統
```

---

## 6. Git Commit 慣例 (Git Commit Conventions)

所有 Agent 執行 Git 提交時，必須採用語義化提交（Conventional Commits），並使用中文清楚說明變更目的：

- `feat:` 新增功能（例如：`feat: 實作 STEP 1 挖掘與 16x16 裂痕動畫`）
- `fix:` 修復問題（例如：`fix: 修復 L 鍵趴下時站起穿模問題`）
- `perf:` 效能優化（例如：`perf: 採用面剔除大幅壓低體素 Draw Calls`）
- `docs:` 文件維護（例如：`docs: 更新 VERIFY.md 查核項目`）
- `refactor:` 代碼重構（不影響外部表現）
- `style:` UI / CSS 樣式微調

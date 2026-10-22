/**
 * GameLoop.js - 嚴格鎖定 30 FPS 的遊戲主迴圈
 */
export class GameLoop {
  constructor(updateFn, renderFn, targetFps = 30) {
    this.updateFn = updateFn;
    this.renderFn = renderFn;
    this.targetFps = targetFps;
    this.frameInterval = 1000 / targetFps; // 33.33ms
    
    this.lastTime = 0;
    this.accumulator = 0;
    this.isRunning = false;
    this.rafId = null;
    
    // FPS 計數器
    this.actualFps = 30;
    this.frameCount = 0;
    this.fpsTimer = 0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsTimer = this.lastTime;
    this.frameCount = 0;
    
    const loop = (currentTime) => {
      if (!this.isRunning) return;
      this.rafId = requestAnimationFrame(loop);

      const delta = currentTime - this.lastTime;
      this.lastTime = currentTime;
      this.accumulator += delta;

      // 累計超過單幀時間 (33.33ms) 才觸發更新與渲染，嚴格鎖定在 30 FPS
      if (this.accumulator >= this.frameInterval) {
        // 固定時間步長傳入（固定為 1 / 30 秒）
        const fixedDeltaSeconds = 1 / this.targetFps;
        
        // 執行邏輯更新
        if (this.updateFn) {
          this.updateFn(fixedDeltaSeconds);
        }
        
        // 執行繪製渲染
        if (this.renderFn) {
          this.renderFn();
        }

        this.frameCount++;
        this.accumulator %= this.frameInterval;
      }

      // 每一秒更新一次實際 FPS 顯示
      if (currentTime - this.fpsTimer >= 1000) {
        this.actualFps = this.frameCount;
        this.frameCount = 0;
        this.fpsTimer = currentTime;
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFps() {
    return this.actualFps;
  }
}

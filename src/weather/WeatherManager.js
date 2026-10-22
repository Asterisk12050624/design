/**
 * WeatherManager.js - 動態天氣系統 (雨、雪、強風位移偏向、冰雹)
 */
import * as THREE from 'three';

export const WEATHER_TYPES = {
  CLEAR: 'Clear',
  RAIN: 'Rain',
  SNOW: 'Snow',
  WINDY: 'Windy',
  HAIL: 'Hail'
};

export const WEATHER_LABELS = {
  [WEATHER_TYPES.CLEAR]: '晴天 ☀️',
  [WEATHER_TYPES.RAIN]: '下雨 🌧️',
  [WEATHER_TYPES.SNOW]: '下雪 ❄️',
  [WEATHER_TYPES.WINDY]: '強風 💨',
  [WEATHER_TYPES.HAIL]: '冰雹 🌨️'
};

export class WeatherManager {
  constructor(scene, playerController) {
    this.scene = scene;
    this.playerController = playerController;

    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.weatherTimer = 0;
    this.cycleDuration = 75; // 每 75 秒自動切換天氣

    this.particleCount = 1200;
    this.particles = null;
    this.particleGeo = null;
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleVelocities = [];

    // 風力向量
    this.windVector = new THREE.Vector2(0, 0);

    this.initParticles();
    this.setWeather(WEATHER_TYPES.CLEAR);
  }

  initParticles() {
    this.particleGeo = new THREE.BufferGeometry();
    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i, true);
    }
    this.particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    // 粒子材質
    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      transparent: true,
      opacity: 0.75
    });

    this.particles = new THREE.Points(this.particleGeo, particleMat);
    this.particles.visible = false;
    this.scene.add(this.particles);
  }

  resetParticle(i, initial = false) {
    const idx = i * 3;
    const px = this.playerController.position.x;
    const pz = this.playerController.position.z;
    const py = this.playerController.position.y;

    // 分佈在玩家周圍半徑 18 格內
    this.particlePositions[idx] = px + (Math.random() - 0.5) * 36;
    this.particlePositions[idx + 1] = initial ? py + Math.random() * 20 : py + 18 + Math.random() * 4;
    this.particlePositions[idx + 2] = pz + (Math.random() - 0.5) * 36;

    if (!this.particleVelocities[i]) {
      this.particleVelocities[i] = new THREE.Vector3();
    }
  }

  setWeather(weatherType) {
    this.currentWeather = weatherType;
    this.weatherTimer = 0;

    const mat = this.particles.material;

    switch (weatherType) {
      case WEATHER_TYPES.CLEAR:
        this.particles.visible = false;
        this.windVector.set(0, 0);
        this.playerController.setWindDrift(0, 0);
        this.scene.background = new THREE.Color('#bfe0f4');
        break;

      case WEATHER_TYPES.RAIN:
        this.particles.visible = true;
        mat.color.setHex(0x7eaed6);
        mat.size = 0.15;
        mat.opacity = 0.65;
        this.windVector.set(0, 0);
        this.playerController.setWindDrift(0, 0);
        this.scene.background = new THREE.Color('#98b4c7');
        break;

      case WEATHER_TYPES.SNOW:
        this.particles.visible = true;
        mat.color.setHex(0xffffff);
        mat.size = 0.22;
        mat.opacity = 0.85;
        this.windVector.set(0, 0);
        this.playerController.setWindDrift(0, 0);
        this.scene.background = new THREE.Color('#d4e5f0');
        break;

      case WEATHER_TYPES.WINDY:
        this.particles.visible = true;
        mat.color.setHex(0xddf0fa);
        mat.size = 0.25;
        mat.opacity = 0.55;
        // 強風全域向量（例如向右前方強烈吹拂）
        this.windVector.set(1.8, 1.2);
        this.playerController.setWindDrift(this.windVector.x, this.windVector.y);
        this.scene.background = new THREE.Color('#afcde0');
        break;

      case WEATHER_TYPES.HAIL:
        this.particles.visible = true;
        mat.color.setHex(0xeef8ff);
        mat.size = 0.32;
        mat.opacity = 0.9;
        this.windVector.set(0, 0);
        this.playerController.setWindDrift(0, 0);
        this.scene.background = new THREE.Color('#788c99'); // 暴風雨暗沉天色
        break;
    }

    if (this.onWeatherChanged) {
      this.onWeatherChanged(this.currentWeather);
    }
  }

  toggleNextWeather() {
    const list = Object.values(WEATHER_TYPES);
    const currIdx = list.indexOf(this.currentWeather);
    const nextIdx = (currIdx + 1) % list.length;
    this.setWeather(list[nextIdx]);
  }

  update(delta) {
    // 自動輪替天氣
    this.weatherTimer += delta;
    if (this.weatherTimer >= this.cycleDuration) {
      this.toggleNextWeather();
    }

    if (!this.particles.visible) return;

    const px = this.playerController.position.x;
    const pz = this.playerController.position.z;
    const py = this.playerController.position.y;

    const pos = this.particlePositions;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;

      if (this.currentWeather === WEATHER_TYPES.RAIN) {
        pos[idx + 1] -= 32 * delta; // 快速下落
      } else if (this.currentWeather === WEATHER_TYPES.SNOW) {
        pos[idx + 1] -= 3.5 * delta; // 緩慢飄落
        pos[idx] += Math.sin(pos[idx + 1] * 0.5 + i) * 1.5 * delta; // 輕微擺動
      } else if (this.currentWeather === WEATHER_TYPES.WINDY) {
        pos[idx + 1] -= 8 * delta;
        pos[idx] += this.windVector.x * 12 * delta;
        pos[idx + 2] += this.windVector.y * 12 * delta;
      } else if (this.currentWeather === WEATHER_TYPES.HAIL) {
        pos[idx + 1] -= 42 * delta; // 高速砸落
      }

      // 重生判定（若掉入地面下方或飄出玩家半徑）
      if (
        pos[idx + 1] < py - 6 ||
        Math.abs(pos[idx] - px) > 22 ||
        Math.abs(pos[idx + 2] - pz) > 22
      ) {
        this.resetParticle(i, false);
      }
    }

    this.particleGeo.attributes.position.needsUpdate = true;
  }
}

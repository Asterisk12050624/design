/**
 * WorldMesher.js - 體素面剔除 (Face Culling) 網格建構器
 */
import * as THREE from 'three';
import { BLOCK_TYPES, WORLD_SIZE } from './VoxelWorld.js';

// 10 種材質對應的紋理路徑
export const TEXTURE_PATHS = [
  'assets/sky-island-assets/textures/16px/grass_top.png',   // 0
  'assets/sky-island-assets/textures/16px/grass_side.png',  // 1
  'assets/sky-island-assets/textures/16px/dirt.png',        // 2
  'assets/sky-island-assets/textures/16px/stone.png',       // 3
  'assets/sky-island-assets/textures/16px/log_top.png',     // 4
  'assets/sky-island-assets/textures/16px/log_side.png',    // 5
  'assets/sky-island-assets/textures/16px/leaves.png',      // 6
  'assets/sky-island-assets/textures/16px/planks.png',      // 7
  'assets/sky-island-assets/textures/16px/sand.png',        // 8
  'assets/sky-island-assets/textures/16px/brick.png'        // 9
];

// 方塊在各個方向面所使用的材質索引
function getFaceTextureIndex(blockId, faceDir) {
  switch (blockId) {
    case BLOCK_TYPES.GRASS:
      if (faceDir === 'top') return 0; // grass_top
      if (faceDir === 'bottom') return 2; // dirt
      return 1; // grass_side
    case BLOCK_TYPES.DIRT:
      return 2; // dirt
    case BLOCK_TYPES.STONE:
      return 3; // stone
    case BLOCK_TYPES.LOG:
      if (faceDir === 'top' || faceDir === 'bottom') return 4; // log_top
      return 5; // log_side
    case BLOCK_TYPES.LEAVES:
      return 6; // leaves
    case BLOCK_TYPES.PLANKS:
      return 7; // planks
    case BLOCK_TYPES.SAND:
      return 8; // sand
    case BLOCK_TYPES.BRICK:
      return 9; // brick
    default:
      return 2;
  }
}

// 6 個面的定義與頂點偏移、法線、UV
const FACES = [
  {
    dir: 'right', // +X
    dx: 1, dy: 0, dz: 0,
    corners: [
      [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]
    ],
    normal: [1, 0, 0]
  },
  {
    dir: 'left', // -X
    dx: -1, dy: 0, dz: 0,
    corners: [
      [0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]
    ],
    normal: [-1, 0, 0]
  },
  {
    dir: 'top', // +Y
    dx: 0, dy: 1, dz: 0,
    corners: [
      [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]
    ],
    normal: [0, 1, 0]
  },
  {
    dir: 'bottom', // -Y
    dx: 0, dy: -1, dz: 0,
    corners: [
      [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]
    ],
    normal: [0, -1, 0]
  },
  {
    dir: 'front', // +Z
    dx: 0, dy: 0, dz: 1,
    corners: [
      [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]
    ],
    normal: [0, 0, 1]
  },
  {
    dir: 'back', // -Z
    dx: 0, dy: 0, dz: -1,
    corners: [
      [0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]
    ],
    normal: [0, 0, -1]
  }
];

export class WorldMesher {
  constructor(voxelWorld) {
    this.voxelWorld = voxelWorld;
    this.materials = [];
    this.mesh = null;
    this.initMaterials();
  }

  initMaterials() {
    const textureLoader = new THREE.TextureLoader();
    this.materials = TEXTURE_PATHS.map((path) => {
      const tex = textureLoader.load(path);
      // 依據規格嚴格設定 NearestFilter 保持像素清晰度
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return new THREE.MeshLambertMaterial({
        map: tex,
        transparent: path.includes('leaves'),
        alphaTest: path.includes('leaves') ? 0.5 : 0
      });
    });
  }

  /**
   * 建立或重建體素網格 (面剔除)
   */
  buildMesh() {
    // 每個材質維護各自的頂點與索引，最後合併並指派 Material Groups
    const numMaterials = this.materials.length;
    const groupPositions = Array.from({ length: numMaterials }, () => []);
    const groupNormals = Array.from({ length: numMaterials }, () => []);
    const groupUvs = Array.from({ length: numMaterials }, () => []);
    const groupIndices = Array.from({ length: numMaterials }, () => []);

    const size = this.voxelWorld.size;

    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          const blockId = this.voxelWorld.getVoxel(x, y, z);
          if (blockId === BLOCK_TYPES.AIR) continue;

          for (const face of FACES) {
            const nx = x + face.dx;
            const ny = y + face.dy;
            const nz = z + face.dz;

            const neighbor = this.voxelWorld.getVoxel(nx, ny, nz);
            
            // 面剔除法則：如果相鄰方塊是空氣（或是葉子/透明方塊），則這個面必須渲染
            const isNeighborOpaque = (neighbor !== BLOCK_TYPES.AIR && neighbor !== BLOCK_TYPES.LEAVES);
            if (isNeighborOpaque && blockId !== BLOCK_TYPES.LEAVES) {
              continue; // 內部面剔除，不渲染！
            }

            const matIdx = getFaceTextureIndex(blockId, face.dir);
            const pos = groupPositions[matIdx];
            const norm = groupNormals[matIdx];
            const uvs = groupUvs[matIdx];
            const ind = groupIndices[matIdx];

            const baseIndex = pos.length / 3;

            // 4 個頂點
            for (let i = 0; i < 4; i++) {
              const c = face.corners[i];
              pos.push(x + c[0], y + c[1], z + c[2]);
              norm.push(face.normal[0], face.normal[1], face.normal[2]);
            }

            // UV 座標 (16x16 填滿各面)
            uvs.push(
              0, 0,
              0, 1,
              1, 1,
              1, 0
            );

            // 2 個三角形 (6 個索引)
            ind.push(
              baseIndex, baseIndex + 1, baseIndex + 2,
              baseIndex, baseIndex + 2, baseIndex + 3
            );
          }
        }
      }
    }

    // 整合所有組合成單一 BufferGeometry
    const allPositions = [];
    const allNormals = [];
    const allUvs = [];
    const allIndices = [];
    const groups = [];

    let vertexOffset = 0;
    let indexOffset = 0;

    for (let m = 0; m < numMaterials; m++) {
      const pos = groupPositions[m];
      const norm = groupNormals[m];
      const uv = groupUvs[m];
      const ind = groupIndices[m];

      if (ind.length === 0) continue;

      const groupStart = indexOffset;
      const groupCount = ind.length;

      for (let i = 0; i < pos.length; i++) allPositions.push(pos[i]);
      for (let i = 0; i < norm.length; i++) allNormals.push(norm[i]);
      for (let i = 0; i < uv.length; i++) allUvs.push(uv[i]);
      for (let i = 0; i < ind.length; i++) {
        allIndices.push(ind[i] + vertexOffset);
      }

      groups.push({ start: groupStart, count: groupCount, materialIndex: m });

      vertexOffset += pos.length / 3;
      indexOffset += groupCount;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(allUvs, 2));
    geometry.setIndex(allIndices);

    for (const g of groups) {
      geometry.addGroup(g.start, g.count, g.materialIndex);
    }

    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geometry, this.materials);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
    } else {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geometry;
    }

    return this.mesh;
  }
}

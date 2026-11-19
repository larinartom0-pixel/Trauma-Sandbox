import * as THREE from 'three';
import { BuildingZone, WallCollider, WORLD_BOUND } from './world';

const CELL_SIZE = 1.4;
const HALF_EXTENT = 198;
const GRID_DIM = Math.floor((HALF_EXTENT * 2) / CELL_SIZE); // 282 x 282 = 79,524 cells
const TOTAL_CELLS = GRID_DIM * GRID_DIM;

// Cost values: 255 = blocked, 10 = open, 18 = near wall (discourages scraping corners)
const COST_BLOCKED = 255;
const COST_OPEN = 10;
const COST_MARGIN = 18;

const DIRS_X = [1, -1, 0, 0, 1, 1, -1, -1];
const DIRS_Z = [0, 0, 1, -1, 1, -1, 1, -1];
const DIRS_DIST = [10, 10, 10, 10, 14, 14, 14, 14];

function segmentIntersectsBox2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-7) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, ax - minX) &&
    clip(dx, maxX - ax) &&
    clip(-dz, az - minZ) &&
    clip(dz, maxZ - az) &&
    t0 <= t1
  );
}

/**
 * High-resolution 2D Grid NavMesh covering the 400x400m town & building interiors.
 * Upper door lintels (minY > 1.72) are ignored and explicit building doorway portals guarantee clean indoor/outdoor exit routing.
 */
export class NavMeshGrid {
  private grid = new Uint8Array(TOTAL_CELLS);
  private candidateCovers: THREE.Vector3[] = [];
  private bodyColliders: WallCollider[] = [];
  private buildings: BuildingZone[] = [];

  // Reusable typed-array A* scratchpads (zero GC in gameplay loop)
  private gScore = new Float32Array(TOTAL_CELLS);
  private fScore = new Float32Array(TOTAL_CELLS);
  private cameFrom = new Int32Array(TOTAL_CELLS);
  private stateStamp = new Uint32Array(TOTAL_CELLS); // 2*stamp = open, 2*stamp+1 = closed
  private searchStamp = 1;
  private heap: number[] = [];

  constructor(
    colliders: WallCollider[],
    worldCoverPoints: THREE.Vector3[],
    buildings: BuildingZone[] = [],
  ) {
    this.buildings = buildings;
    this.bodyColliders = colliders.filter((c) => c.minY <= 1.72 && c.maxY >= 0.15);
    this.bake(colliders, worldCoverPoints);
  }

  private bake(colliders: WallCollider[], worldCoverPoints: THREE.Vector3[]) {
    this.grid.fill(COST_OPEN);
    const pad = 0.52;

    // 1. Mark blocked cells from body-height colliders (ignore door lintels above 1.72m!)
    for (const c of this.bodyColliders) {
      const minGx = Math.max(0, this.worldToGrid(c.minX - pad));
      const maxGx = Math.min(GRID_DIM - 1, this.worldToGrid(c.maxX + pad));
      const minGz = Math.max(0, this.worldToGrid(c.minZ - pad));
      const maxGz = Math.min(GRID_DIM - 1, this.worldToGrid(c.maxZ + pad));

      for (let gz = minGz; gz <= maxGz; gz++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          const wx = this.gridToWorld(gx);
          const wz = this.gridToWorld(gz);
          if (
            wx >= c.minX - pad &&
            wx <= c.maxX + pad &&
            wz >= c.minZ - pad &&
            wz <= c.maxZ + pad
          ) {
            this.grid[gz * GRID_DIM + gx] = COST_BLOCKED;
          }
        }
      }
    }

    // 1b. Guarantee every building doorway corridor stays cleanly walkable
    for (const b of this.buildings) {
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = THREE.MathUtils.lerp(b.doorInside.x, b.doorOutside.x, t);
        const cz = THREE.MathUtils.lerp(b.doorInside.z, b.doorOutside.z, t);
        const gx = this.worldToGrid(cx);
        const gz = this.worldToGrid(cz);
        for (let oz = -1; oz <= 1; oz++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = gx + ox;
            const nz = gz + oz;
            if (nx < 0 || nz < 0 || nx >= GRID_DIM || nz >= GRID_DIM) continue;
            const wx = this.gridToWorld(nx);
            const wz = this.gridToWorld(nz);
            const hitsSolid = this.bodyColliders.some(
              (c) =>
                wx >= c.minX - 0.34 &&
                wx <= c.maxX + 0.34 &&
                wz >= c.minZ - 0.34 &&
                wz <= c.maxZ + 0.34,
            );
            if (!hitsSolid) {
              this.grid[nz * GRID_DIM + nx] = COST_OPEN;
            }
          }
        }
      }
    }

    // 2. Add soft wall-margin penalty so bots stay centered through doorways
    for (let gz = 1; gz < GRID_DIM - 1; gz++) {
      for (let gx = 1; gx < GRID_DIM - 1; gx++) {
        const idx = gz * GRID_DIM + gx;
        if (this.grid[idx] === COST_BLOCKED) continue;
        if (
          this.grid[idx - 1] === COST_BLOCKED ||
          this.grid[idx + 1] === COST_BLOCKED ||
          this.grid[idx - GRID_DIM] === COST_BLOCKED ||
          this.grid[idx + GRID_DIM] === COST_BLOCKED
        ) {
          this.grid[idx] = COST_MARGIN;
        }
      }
    }

    // 3. Generate tactical cover points around cars, barriers, containers, and building corners
    this.candidateCovers = [];
    for (const p of worldCoverPoints) {
      const snapped = this.findNearestWalkable(p.x, p.z);
      if (snapped) this.candidateCovers.push(snapped);
    }

    for (const c of colliders) {
      if (c.minY > 1.2 || c.maxY < 0.75) continue;
      const sx = c.maxX - c.minX;
      const sz = c.maxZ - c.minZ;
      if (sx < 0.7 && sz < 0.7) continue;

      const cx = (c.minX + c.maxX) * 0.5;
      const cz = (c.minZ + c.maxZ) * 0.5;
      const cPad = 1.45;
      const offsets: [number, number][] = [
        [c.minX - cPad, cz],
        [c.maxX + cPad, cz],
        [cx, c.minZ - cPad],
        [cx, c.maxZ + cPad],
      ];
      for (const [ox, oz] of offsets) {
        if (Math.abs(ox) > WORLD_BOUND || Math.abs(oz) > WORLD_BOUND) continue;
        if (this.isWalkableWorld(ox, oz)) {
          this.candidateCovers.push(new THREE.Vector3(ox, 0, oz));
        }
      }
    }
  }

  private worldToGrid(val: number): number {
    return Math.max(
      0,
      Math.min(GRID_DIM - 1, Math.floor((val + HALF_EXTENT) / CELL_SIZE)),
    );
  }

  private gridToWorld(g: number): number {
    return -HALF_EXTENT + (g + 0.5) * CELL_SIZE;
  }

  isWalkableCell(gx: number, gz: number): boolean {
    if (gx < 0 || gz < 0 || gx >= GRID_DIM || gz >= GRID_DIM) return false;
    return this.grid[gz * GRID_DIM + gx] !== COST_BLOCKED;
  }

  isWalkableWorld(wx: number, wz: number): boolean {
    return this.isWalkableCell(this.worldToGrid(wx), this.worldToGrid(wz));
  }

  findContainingBuilding(wx: number, wz: number): BuildingZone | null {
    for (const b of this.buildings) {
      if (wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ) {
        return b;
      }
    }
    return null;
  }

  getDoorExitForPos(wx: number, wz: number): THREE.Vector3 | null {
    const b = this.findContainingBuilding(wx, wz);
    return b ? b.doorOutside : null;
  }

  findNearestWalkable(wx: number, wz: number, maxRadiusCells = 8): THREE.Vector3 | null {
    const startX = this.worldToGrid(wx);
    const startZ = this.worldToGrid(wz);
    if (this.isWalkableCell(startX, startZ)) {
      return new THREE.Vector3(this.gridToWorld(startX), 0, this.gridToWorld(startZ));
    }

    let bestDistSq = Infinity;
    let bestGx = -1;
    let bestGz = -1;
    for (let r = 1; r <= maxRadiusCells; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const gx = startX + dx;
          const gz = startZ + dz;
          if (!this.isWalkableCell(gx, gz)) continue;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestGx = gx;
            bestGz = gz;
          }
        }
      }
      if (bestGx !== -1) {
        return new THREE.Vector3(this.gridToWorld(bestGx), 0, this.gridToWorld(bestGz));
      }
    }
    return null;
  }

  /**
   * Checks whether a corridor of width ~0.92m between two world XZ coordinates stays completely clear of walls and blocked cells.
   */
  hasWalkableLine(ax: number, az: number, bx: number, bz: number): boolean {
    const wallPad = 0.46;
    for (const c of this.bodyColliders) {
      if (
        segmentIntersectsBox2D(
          ax,
          az,
          bx,
          bz,
          c.minX - wallPad,
          c.maxX + wallPad,
          c.minZ - wallPad,
          c.maxZ + wallPad,
        )
      ) {
        return false;
      }
    }

    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) return true;
    const perpX = (-dz / dist) * 0.44;
    const perpZ = (dx / dist) * 0.44;
    const steps = Math.ceil(dist / 0.7);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = ax + dx * t;
      const cz = az + dz * t;
      if (
        !this.isWalkableWorld(cx, cz) ||
        !this.isWalkableWorld(cx + perpX, cz + perpZ) ||
        !this.isWalkableWorld(cx - perpX, cz - perpZ)
      ) {
        return false;
      }
    }
    return true;
  }

  private heapPush(idx: number) {
    const h = this.heap;
    h.push(idx);
    let pos = h.length - 1;
    const f = this.fScore[idx];
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      const pIdx = h[parent];
      if (f >= this.fScore[pIdx]) break;
      h[pos] = pIdx;
      pos = parent;
    }
    h[pos] = idx;
  }

  private heapPop(): number {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let pos = 0;
      const len = h.length;
      const f = this.fScore[last];
      while (true) {
        const left = (pos << 1) + 1;
        if (left >= len) break;
        const right = left + 1;
        let smallest = left;
        if (right < len && this.fScore[h[right]] < this.fScore[h[left]]) {
          smallest = right;
        }
        if (f <= this.fScore[h[smallest]]) break;
        h[pos] = h[smallest];
        pos = smallest;
      }
      h[pos] = last;
    }
    return top;
  }

  /**
   * Routes cleanly through building doorway portals when entering or exiting buildings, then delegates to A*.
   */
  findPath(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    maxExpansions = 12000,
  ): THREE.Vector3[] {
    const startBld = this.findContainingBuilding(startX, startZ);
    const goalBld = this.findContainingBuilding(goalX, goalZ);

    // If inside a building and destination is outside (or in a different building), exit through our doorway first!
    if (startBld && startBld !== goalBld) {
      const toDoor = this.runAStar(
        startX,
        startZ,
        startBld.doorOutside.x,
        startBld.doorOutside.z,
        3200,
      );
      const afterDoor = this.runAStar(
        startBld.doorOutside.x,
        startBld.doorOutside.z,
        goalBld ? goalBld.doorOutside.x : goalX,
        goalBld ? goalBld.doorOutside.z : goalZ,
        maxExpansions,
      );
      const combined = [...toDoor, ...afterDoor];
      if (goalBld) {
        combined.push(goalBld.doorInside.clone(), new THREE.Vector3(goalX, 0, goalZ));
      }
      return combined;
    }

    // If outside and destination is inside a building, enter cleanly through its doorway
    if (!startBld && goalBld) {
      const toDoor = this.runAStar(
        startX,
        startZ,
        goalBld.doorOutside.x,
        goalBld.doorOutside.z,
        maxExpansions,
      );
      const inside = this.runAStar(
        goalBld.doorOutside.x,
        goalBld.doorOutside.z,
        goalX,
        goalZ,
        2400,
      );
      return [...toDoor, ...inside];
    }

    return this.runAStar(startX, startZ, goalX, goalZ, maxExpansions);
  }

  private runAStar(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    maxExpansions: number,
  ): THREE.Vector3[] {
    if (this.hasWalkableLine(startX, startZ, goalX, goalZ)) {
      return [new THREE.Vector3(goalX, 0, goalZ)];
    }

    const startSnap = this.findNearestWalkable(startX, startZ, 6);
    const goalSnap = this.findNearestWalkable(goalX, goalZ, 8);
    if (!startSnap || !goalSnap) {
      return [new THREE.Vector3(goalX, 0, goalZ)];
    }

    const sx = this.worldToGrid(startSnap.x);
    const sz = this.worldToGrid(startSnap.z);
    const gx = this.worldToGrid(goalSnap.x);
    const gz = this.worldToGrid(goalSnap.z);

    const startIdx = sz * GRID_DIM + sx;
    const goalIdx = gz * GRID_DIM + gx;
    if (startIdx === goalIdx) {
      return [goalSnap];
    }

    this.searchStamp += 1;
    if (this.searchStamp >= 0x7ffffff0) {
      this.stateStamp.fill(0);
      this.searchStamp = 1;
    }
    const openMark = this.searchStamp * 2;
    const closedMark = openMark + 1;

    this.heap.length = 0;
    this.gScore[startIdx] = 0;
    this.fScore[startIdx] = Math.hypot(gx - sx, gz - sz) * COST_OPEN;
    this.cameFrom[startIdx] = -1;
    this.stateStamp[startIdx] = openMark;
    this.heapPush(startIdx);

    let bestIdx = startIdx;
    let bestH = Infinity;
    let expansions = 0;
    let found = false;

    while (this.heap.length > 0 && expansions < maxExpansions) {
      const cur = this.heapPop();
      if (this.stateStamp[cur] === closedMark) continue;
      this.stateStamp[cur] = closedMark;
      expansions++;

      if (cur === goalIdx) {
        bestIdx = cur;
        found = true;
        break;
      }

      const cx = cur % GRID_DIM;
      const cz = (cur / GRID_DIM) | 0;
      const hCur = Math.hypot(gx - cx, gz - cz);
      if (hCur < bestH) {
        bestH = hCur;
        bestIdx = cur;
      }

      const curG = this.gScore[cur];

      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS_X[d];
        const nz = cz + DIRS_Z[d];
        if (!this.isWalkableCell(nx, nz)) continue;

        if (d >= 4) {
          if (
            !this.isWalkableCell(cx + DIRS_X[d], cz) ||
            !this.isWalkableCell(cx, cz + DIRS_Z[d])
          ) {
            continue;
          }
        }

        const nIdx = nz * GRID_DIM + nx;
        if (this.stateStamp[nIdx] === closedMark) continue;

        const cellCost = this.grid[nIdx];
        const stepCost = (DIRS_DIST[d] * cellCost) / COST_OPEN;
        const tentG = curG + stepCost;

        if (this.stateStamp[nIdx] !== openMark || tentG < this.gScore[nIdx]) {
          this.cameFrom[nIdx] = cur;
          this.gScore[nIdx] = tentG;
          this.fScore[nIdx] = tentG + Math.hypot(gx - nx, gz - nz) * COST_OPEN;
          this.stateStamp[nIdx] = openMark;
          this.heapPush(nIdx);
        }
      }
    }

    const raw: THREE.Vector3[] = [];
    let trace = found ? goalIdx : bestIdx;
    let guard = 0;
    while (trace !== -1 && trace !== startIdx && guard < 1600) {
      const tx = trace % GRID_DIM;
      const tz = (trace / GRID_DIM) | 0;
      raw.push(new THREE.Vector3(this.gridToWorld(tx), 0, this.gridToWorld(tz)));
      trace = this.cameFrom[trace];
      guard++;
    }
    raw.reverse();
    if (found && this.isWalkableWorld(goalX, goalZ)) {
      raw.push(new THREE.Vector3(goalX, 0, goalZ));
    }
    if (raw.length === 0) {
      return [goalSnap];
    }

    // String-pulling path smoother with exact wall-collision check
    const smoothed: THREE.Vector3[] = [];
    let anchorX = startX;
    let anchorZ = startZ;
    let i = 0;
    while (i < raw.length) {
      let furthest = i;
      for (let j = raw.length - 1; j > i; j--) {
        if (this.hasWalkableLine(anchorX, anchorZ, raw[j].x, raw[j].z)) {
          furthest = j;
          break;
        }
      }
      smoothed.push(raw[furthest]);
      anchorX = raw[furthest].x;
      anchorZ = raw[furthest].z;
      i = furthest + 1;
    }

    return smoothed;
  }

  /**
   * Finds a nearby walkable cover position that blocks Line-of-Sight from `threatPos`.
   */
  findBestCover(
    botPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    hasLos: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    maxDist = 30,
  ): THREE.Vector3 | null {
    let bestScore = -Infinity;
    let bestPt: THREE.Vector3 | null = null;

    for (const c of this.candidateCovers) {
      const dBot = botPos.distanceTo(c);
      if (dBot > maxDist || dBot < 1.0) continue;
      const dThreat = threatPos.distanceTo(c);
      if (dThreat < 4.5) continue;

      const blockedFromThreat = !hasLos(c, threatPos);
      if (!blockedFromThreat) continue;

      const score = 40 - dBot * 1.4 + Math.min(18, dThreat) * 0.45;
      if (score > bestScore) {
        bestScore = score;
        bestPt = c;
      }
    }

    return bestPt ? bestPt.clone() : null;
  }

  /**
   * Finds a walkable flanking waypoint laterally offset around `targetPos`.
   */
  findFlankPoint(
    botPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    sideSign: number,
  ): THREE.Vector3 | null {
    const dx = targetPos.x - botPos.x;
    const dz = targetPos.z - botPos.z;
    const len = Math.hypot(dx, dz) || 1;
    const perpX = (-dz / len) * sideSign;
    const perpZ = (dx / len) * sideSign;

    const candX = targetPos.x + perpX * 8.5 - (dx / len) * 2.5;
    const candZ = targetPos.z + perpZ * 8.5 - (dz / len) * 2.5;
    return this.findNearestWalkable(candX, candZ, 6);
  }
}

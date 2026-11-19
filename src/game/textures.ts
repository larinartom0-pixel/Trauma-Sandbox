import * as THREE from 'three';

export interface ProceduralTexturePack {
  asphalt: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  clinicTile: THREE.CanvasTexture;
  woodCrate: THREE.CanvasTexture;
  bloodDecal: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  isColor = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(
  maxAnisotropy: number,
): ProceduralTexturePack {
  // 1. Cracked Asphalt
  const [asphCanvas, asphCtx] = makeCanvas(512);
  asphCtx.fillStyle = '#252930';
  asphCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const v = 28 + Math.floor(Math.random() * 24);
    asphCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    asphCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  asphCtx.strokeStyle = 'rgba(12, 14, 18, 0.55)';
  asphCtx.lineWidth = 1.5;
  for (let c = 0; c < 8; c++) {
    asphCtx.beginPath();
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    asphCtx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      asphCtx.lineTo(x, y);
    }
    asphCtx.stroke();
  }
  const asphalt = finalizeTexture(asphCanvas, 18, 18, maxAnisotropy);

  // 2. Weathered Concrete
  const [concCanvas, concCtx] = makeCanvas(256);
  concCtx.fillStyle = '#474e57';
  concCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const v = 58 + Math.floor(Math.random() * 30);
    concCtx.fillStyle = `rgba(${v},${v + 2},${v + 4},0.45)`;
    concCtx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  concCtx.strokeStyle = 'rgba(20, 23, 28, 0.45)';
  concCtx.lineWidth = 2;
  concCtx.strokeRect(2, 2, 252, 252);
  const concrete = finalizeTexture(concCanvas, 4, 4, maxAnisotropy);

  // 3. Aged Brick / Plaster Wall
  const [brickCanvas, brickCtx] = makeCanvas(256);
  brickCtx.fillStyle = '#5c4b43';
  brickCtx.fillRect(0, 0, 256, 256);
  const rowH = 24;
  const colW = 64;
  for (let row = 0; row < 11; row++) {
    const offset = (row % 2) * (colW / 2);
    for (let col = -1; col < 5; col++) {
      const shade = 72 + Math.floor(Math.random() * 28);
      brickCtx.fillStyle = `rgb(${shade + 18}, ${shade}, ${shade - 8})`;
      brickCtx.fillRect(col * colW + offset + 2, row * rowH + 2, colW - 4, rowH - 4);
    }
  }
  // Grime at bottom
  const grad = brickCtx.createLinearGradient(0, 140, 0, 256);
  grad.addColorStop(0, 'rgba(18, 20, 22, 0)');
  grad.addColorStop(1, 'rgba(18, 20, 22, 0.45)');
  brickCtx.fillStyle = grad;
  brickCtx.fillRect(0, 140, 256, 116);
  const brick = finalizeTexture(brickCanvas, 3, 2, maxAnisotropy);

  // 4. Clinic Tile
  const [tileCanvas, tileCtx] = makeCanvas(256);
  tileCtx.fillStyle = '#8b999e';
  tileCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const tint = (x / 32 + y / 32) % 2 === 0 ? '#9ab0b3' : '#7f9397';
      tileCtx.fillStyle = tint;
      tileCtx.fillRect(x + 1, y + 1, 30, 30);
    }
  }
  const clinicTile = finalizeTexture(tileCanvas, 3, 3, maxAnisotropy);

  // 5. Wood Crate
  const [woodCanvas, woodCtx] = makeCanvas(256);
  woodCtx.fillStyle = '#6c5238';
  woodCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    woodCtx.fillStyle = `rgba(45, 30, 16, ${Math.random() * 0.28})`;
    woodCtx.fillRect(0, Math.random() * 256, 256, 2);
  }
  woodCtx.strokeStyle = '#3b2919';
  woodCtx.lineWidth = 14;
  woodCtx.strokeRect(7, 7, 242, 242);
  woodCtx.beginPath();
  woodCtx.moveTo(14, 14);
  woodCtx.lineTo(242, 242);
  woodCtx.stroke();
  const woodCrate = finalizeTexture(woodCanvas, 1, 1, maxAnisotropy);

  // 6. Blood Decal
  const [bloodCanvas, bloodCtx] = makeCanvas(256);
  bloodCtx.clearRect(0, 0, 256, 256);
  const bGrad = bloodCtx.createRadialGradient(128, 128, 12, 128, 128, 118);
  bGrad.addColorStop(0, 'rgba(105, 8, 12, 0.96)');
  bGrad.addColorStop(0.55, 'rgba(135, 12, 16, 0.85)');
  bGrad.addColorStop(1, 'rgba(70, 5, 8, 0)');
  bloodCtx.fillStyle = bGrad;
  bloodCtx.beginPath();
  bloodCtx.arc(128, 128, 118, 0, Math.PI * 2);
  bloodCtx.fill();
  for (let s = 0; s < 14; s++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 48 + Math.random() * 64;
    bloodCtx.fillStyle = 'rgba(115, 10, 14, 0.82)';
    bloodCtx.beginPath();
    bloodCtx.arc(
      128 + Math.cos(ang) * dist,
      128 + Math.sin(ang) * dist,
      4 + Math.random() * 11,
      0,
      Math.PI * 2,
    );
    bloodCtx.fill();
  }
  const bloodDecal = new THREE.CanvasTexture(bloodCanvas);
  bloodDecal.colorSpace = THREE.SRGBColorSpace;
  bloodDecal.needsUpdate = true;

  // 7. Radial Contact Shadow
  const [shadCanvas, shadCtx] = makeCanvas(128);
  const sGrad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = sGrad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadCanvas);
  contactShadow.needsUpdate = true;

  return {
    asphalt,
    concrete,
    brick,
    clinicTile,
    woodCrate,
    bloodDecal,
    contactShadow,
    dispose: () => {
      asphalt.dispose();
      concrete.dispose();
      brick.dispose();
      clinicTile.dispose();
      woodCrate.dispose();
      bloodDecal.dispose();
      contactShadow.dispose();
    },
  };
}

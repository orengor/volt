import * as THREE from "three";

export function paperTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3ead8";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 1800; i++) {
    const v = 220 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgba(${v},${v - 12},${v - 28},${0.07 + Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function waterTexture() {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, "#8ec8d6");
  g.addColorStop(1, "#7bb8c8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    const y = 16 + i * 18;
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * 3);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

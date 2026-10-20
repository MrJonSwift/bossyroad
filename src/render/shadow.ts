import * as THREE from "three";

export function makeShadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    gradient.addColorStop(0, "rgba(17, 35, 23, 0.5)");
    gradient.addColorStop(0.55, "rgba(17, 35, 23, 0.24)");
    gradient.addColorStop(1, "rgba(17, 35, 23, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity,
  });
}

import * as THREE from "three";

const MAX_PARTICLES = 32;
const GRAVITY = 1.6;

function makeDustTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255, 247, 224, 0.9)");
    gradient.addColorStop(0.6, "rgba(255, 247, 224, 0.35)");
    gradient.addColorStop(1, "rgba(255, 247, 224, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One Points object for every dust puff, so landing effects cost a single draw
 * call. Particles are cosmetic: the simulation never reads them.
 */
export class DustPool {
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;
  private cursor = 0;
  private active = 0;

  constructor(scene: THREE.Scene) {
    this.positions.fill(-100);

    const position = new THREE.BufferAttribute(this.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.BufferAttribute(this.colors, 3);
    color.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute("position", position);
    this.geometry.setAttribute("color", color);

    const material = new THREE.PointsMaterial({
      map: makeDustTexture(),
      size: 0.34,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.visible = false;
    scene.add(this.points);
  }

  burst(
    x: number,
    z: number,
    count: number,
    color: number,
    strength = 1,
  ): void {
    if (count <= 0) {
      return;
    }

    const tint = new THREE.Color(color);

    for (let i = 0; i < count; i += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.35 + Math.random() * 0.55) * strength;
      const offset = (Math.random() - 0.5) * 0.35;

      this.positions[index * 3] = x + offset * 0.4;
      this.positions[index * 3 + 1] = 0.07 + Math.random() * 0.08;
      this.positions[index * 3 + 2] = -z + offset * 0.4;
      this.velocities[index * 3] = Math.cos(angle) * speed;
      this.velocities[index * 3 + 1] = 0.5 + Math.random() * 0.7;
      this.velocities[index * 3 + 2] = Math.sin(angle) * speed;
      this.maxLife[index] = 0.28 + Math.random() * 0.28;
      this.life[index] = this.maxLife[index];

      // A little variation stops the burst reading as one flat colour.
      const shade = 0.88 + Math.random() * 0.12;
      this.colors[index * 3] = tint.r * shade;
      this.colors[index * 3 + 1] = tint.g * shade;
      this.colors[index * 3 + 2] = tint.b * shade;
    }

    this.active = Math.min(MAX_PARTICLES, this.active + count);
    this.points.visible = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.active === 0) {
      this.points.visible = false;
      return;
    }

    let alive = 0;

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) {
        continue;
      }

      this.life[i] -= dt;

      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }

      alive += 1;
      const fade = this.life[i] / this.maxLife[i];
      this.velocities[i * 3] *= 1 - Math.min(1, dt * 2.4);
      this.velocities[i * 3 + 2] *= 1 - Math.min(1, dt * 2.4);
      this.velocities[i * 3 + 1] -= GRAVITY * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      if (this.positions[i * 3 + 1] < 0.02) {
        this.positions[i * 3 + 1] = 0.02;
        this.velocities[i * 3 + 1] = 0;
      }

      // Settle rather than vanish abruptly.
      this.positions[i * 3 + 1] += fade * 0.001;
    }

    this.active = alive;
    this.points.visible = alive > 0;
    this.geometry.attributes.position.needsUpdate = true;
  }
}

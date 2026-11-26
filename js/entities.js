/**
 * Entities — Hệ thống chuyển động khung hình trên nền scene-bg.png (tọa độ chuẩn 1260x540):
 * - Đi bộ: worker-walk-1..4 / driver-walk-1..4
 * - Bê hàng: worker-carry-1..2
 * - Xe chạy: bike-1..3 / truck-small-1..3 / truck-large-1..3
 * - Băng chuyền: conveyor-1..4
 * - Xe nâng: forklift-1..3
 */
class AnimatedEntity {
  constructor({ x, y, width, height, frames, fps = 6, vx = 0, vy = 0, label = '', fallbackAsset = null, shadow = true }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.frames = frames;
    this.fps = fps;
    this.vx = vx;
    this.vy = vy;
    this.label = label;
    this.fallbackAsset = fallbackAsset;
    this.shadow = shadow;
    this.frameIndex = 0;
    this.timer = 0;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.frames.length > 1) {
      this.timer += dt;
      const interval = 1 / this.fps;
      if (this.timer >= interval) {
        this.timer -= interval;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      }
    }
  }

  draw(ctx, assets) {
    const file = this.frames[this.frameIndex];
    const sprite = assets.get(file) || (this.fallbackAsset ? assets.get(this.fallbackAsset) : null);
    if (!sprite) return;

    if (this.shadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(92, 64, 38, 0.22)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.height * 0.34, this.width * 0.32, this.height * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.drawImage(sprite, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
  }
}

class WorkerEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 72, height: 72,
      frames: ASSET_MANIFEST.animations.workerWalk,
      fps: 7, label: 'Kho', fallbackAsset: 'worker-warehouse.png'
    });
    this.carrying = false;
    this.targetX = 620;
    this.targetY = 265;
    this.speed = 64;
  }

  update(dt) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      this.carrying = !this.carrying;
      this.frames = this.carrying
        ? ASSET_MANIFEST.animations.workerCarry
        : ASSET_MANIFEST.animations.workerWalk;
      this.frameIndex = 0;
      if (this.carrying) {
        this.targetX = 330 + Math.random() * 110;
        this.targetY = 225 + Math.random() * 55;
      } else {
        this.targetX = 640 + Math.random() * 130;
        this.targetY = 250 + Math.random() * 75;
      }
    } else {
      this.vx = (dx / dist) * this.speed;
      this.vy = (dy / dist) * this.speed;
    }
    super.update(dt);
  }
}

class DriverEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 72, height: 72,
      frames: ASSET_MANIFEST.animations.driverWalk,
      fps: 6, label: 'Tài xế', fallbackAsset: 'driver.png'
    });
    this.dir = 1;
    this.minX = 760;
    this.maxX = 910;
    this.speed = 42;
  }

  update(dt) {
    this.vx = this.dir * this.speed;
    this.vy = this.dir * 8;
    if (this.x > this.maxX) this.dir = -1;
    if (this.x < this.minX) this.dir = 1;
    super.update(dt);
  }
}

class VehicleEntity extends AnimatedEntity {
  constructor({ type, x, y, orders, zone, onComplete }) {
    const cfg = VEHICLE_TYPES[type];
    const sizes = { bike: 78, truckSmall: 108, truckLarge: 126 };
    const sz = sizes[type] || 96;
    super({
      x, y, width: sz, height: sz,
      frames: ASSET_MANIFEST.animations[cfg.animKey],
      fps: 10, label: cfg.name, fallbackAsset: cfg.idleAsset
    });
    this.type = type;
    this.speed = cfg.speed;
    this.orders = orders;
    this.zone = zone;
    this.onComplete = onComplete;
    this.done = false;
    this.progress = 0;
  }

  update(dt) {
    const distMult = this.zone ? this.zone.distanceMult : 1;
    const travelSec = (4.8 * distMult) * (120 / this.speed);
    this.progress += dt / travelSec;
    // Chạy dọc theo đường nhựa bên phải cửa xuất hàng
    this.vx = this.speed * 0.72;
    this.vy = this.speed * 0.34;
    super.update(dt);
    if (this.progress >= 1 || this.x > 1360 || this.y > 600) {
      this.done = true;
      if (this.onComplete) this.onComplete(this);
    }
  }
}

class ForkliftEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 98, height: 98,
      frames: ASSET_MANIFEST.animations.forklift,
      fps: 2, label: 'Xe nâng', fallbackAsset: 'forklift.png'
    });
    this.active = true;
    this.baseX = x;
    this.baseY = y;
    this.phase = 0;
  }

  update(dt) {
    if (!this.active) {
      this.frameIndex = 0;
      return;
    }
    this.phase += dt * 0.95;
    this.x = this.baseX + Math.sin(this.phase) * 52;
    this.y = this.baseY + Math.sin(this.phase) * 18;
    super.update(dt);
  }
}

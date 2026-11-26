/**
 * Entities — Giữ nguyên hệ thống chuyển động khung hình:
 * - Đi bộ: walk-1 -> 2 -> 3 -> 4
 * - Bê hàng: carry-1 -> 2
 * - Xe chạy: 1 -> 2 -> 3
 * - Băng chuyền: 1 -> 2 -> 3 -> 4
 * - Xe nâng: forklift-1 -> 2 -> 3
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

    // Bóng đổ mềm dưới chân thực thể
    if (this.shadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(92, 64, 38, 0.18)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + this.height * 0.34, this.width * 0.34, this.height * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (sprite) {
      ctx.drawImage(sprite, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    } else {
      // Thẻ chibi kem/gỗ ấm nếu đang tải asset
      ctx.save();
      ctx.fillStyle = '#fff8eb';
      ctx.strokeStyle = '#c88a4b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(this.x - 28, this.y - 16, 56, 32, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6b4226';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.label || '...', this.x, this.y + 4);
      ctx.restore();
    }
  }
}

class WorkerEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 84, height: 84,
      frames: ASSET_MANIFEST.animations.workerWalk,
      fps: 7, label: 'Kho', fallbackAsset: 'worker-warehouse.png'
    });
    this.carrying = false;
    this.targetX = 460;
    this.targetY = 265;
    this.speed = 68;
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
        this.targetX = 235 + Math.random() * 60;
        this.targetY = 215 + Math.random() * 40;
      } else {
        this.targetX = 470 + Math.random() * 80;
        this.targetY = 250 + Math.random() * 55;
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
      x, y, width: 86, height: 86,
      frames: ASSET_MANIFEST.animations.driverWalk,
      fps: 6, label: 'Tài xế', fallbackAsset: 'driver.png'
    });
    this.dir = 1;
    this.minX = 590;
    this.maxX = 760;
    this.speed = 46;
  }

  update(dt) {
    this.vx = this.dir * this.speed;
    this.vy = this.dir * 10;
    if (this.x > this.maxX) this.dir = -1;
    if (this.x < this.minX) this.dir = 1;
    super.update(dt);
  }
}

class VehicleEntity extends AnimatedEntity {
  constructor({ type, x, y, orders, zone, onComplete }) {
    const cfg = VEHICLE_TYPES[type];
    const sizes = { bike: 96, truckSmall: 132, truckLarge: 154 };
    const sz = sizes[type] || 110;
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
    this.progress = 0; // 0 -> 1 trên đường giao hàng
  }

  update(dt) {
    const distMult = this.zone ? this.zone.distanceMult : 1;
    const travelSec = (typeSpeed => (4.8 * distMult) * (120 / typeSpeed))(this.speed);
    this.progress += dt / travelSec;
    this.vx = -this.speed * 0.85;
    this.vy = this.speed * 0.34;
    super.update(dt);
    if (this.progress >= 1 || this.x < -120 || this.y > 560) {
      this.done = true;
      if (this.onComplete) this.onComplete(this);
    }
  }
}

class ForkliftEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 122, height: 122,
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
    this.phase += dt * 1.1;
    this.x = this.baseX + Math.sin(this.phase) * 44;
    this.y = this.baseY + Math.sin(this.phase) * 16;
    super.update(dt);
  }
}

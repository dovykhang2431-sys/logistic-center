/**
 * Entities — Giữ nguyên hệ thống chuyển động khung hình:
 * - Đi bộ: walk-1 -> 2 -> 3 -> 4
 * - Bê hàng: carry-1 -> 2
 * - Xe chạy: 1 -> 2 -> 3
 * - Băng chuyền: 1 -> 2 -> 3 -> 4
 * - Xe nâng: forklift-1 -> 2 -> 3
 */
class AnimatedEntity {
  constructor({ x, y, width, height, frames, fps = 6, vx = 0, vy = 0, label = '' }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.frames = frames;
    this.fps = fps;
    this.vx = vx;
    this.vy = vy;
    this.label = label;
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
    const sprite = assets.get(file);
    if (sprite) {
      ctx.drawImage(sprite, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    } else {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.label || file, this.x, this.y + 4);
      ctx.restore();
    }
  }
}

class WorkerEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 72, height: 72,
      frames: ASSET_MANIFEST.animations.workerWalk,
      fps: 7, label: 'Worker'
    });
    this.carrying = false;
    this.targetX = 360;
    this.targetY = 230;
    this.speed = 65;
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
        this.targetX = 180 + Math.random() * 40;
        this.targetY = 180 + Math.random() * 30;
      } else {
        this.targetX = 350 + Math.random() * 50;
        this.targetY = 220 + Math.random() * 40;
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
      x, y, width: 74, height: 74,
      frames: ASSET_MANIFEST.animations.driverWalk,
      fps: 6, label: 'Driver'
    });
    this.dir = 1;
    this.minX = 430;
    this.maxX = 620;
    this.speed = 46;
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
    const sizes = { bike: 86, truckSmall: 118, truckLarge: 140 };
    const sz = sizes[type] || 100;
    super({
      x, y, width: sz, height: sz,
      frames: ASSET_MANIFEST.animations[cfg.animKey],
      fps: 10, label: cfg.name
    });
    this.type = type;
    this.speed = cfg.speed;
    this.orders = orders;
    this.zone = zone;
    this.onComplete = onComplete;
    this.done = false;
  }

  update(dt) {
    this.vx = -this.speed;
    this.vy = this.speed * 0.36;
    super.update(dt);
    if (this.x < -110 || this.y > 540) {
      this.done = true;
      if (this.onComplete) this.onComplete(this);
    }
  }
}

class ForkliftEntity extends AnimatedEntity {
  constructor(x, y) {
    super({
      x, y, width: 104, height: 104,
      frames: ASSET_MANIFEST.animations.forklift,
      fps: 2, label: 'Forklift'
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
    this.x = this.baseX + Math.sin(this.phase) * 38;
    this.y = this.baseY + Math.sin(this.phase) * 14;
    super.update(dt);
  }
}

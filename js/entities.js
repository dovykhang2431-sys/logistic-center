/**
 * Entities — Hệ thống chuyển động mượt 60fps (v1.3):
 * - Nội suy vị trí mượt từ điểm A sang điểm B với đường cong tăng tốc / giảm tốc (smoothstep / ease-in-out).
 * - Tốc độ đổi khung hình sprite (walk/carry/wheel) tự khớp với vận tốc tức thời.
 * - Giữ đúng tỉ lệ gốc của ảnh PNG (không kéo méo nhân vật chibi) và tự xoay hướng theo chiều di chuyển.
 */

// Hàm tăng tốc / giảm tốc mượt (ease-in-out cubic/sine kết hợp)
function easeInOutSmooth(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * clamped);
}

// Đạo hàm chuẩn hóa của easeInOutSmooth (0 ở hai đầu, đỉnh = pi/2 ở giữa) để đồng bộ nhịp bước chân
function easeInOutSpeedFactor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return Math.sin(Math.PI * clamped);
}

class AnimatedEntity {
  constructor({
    x, y, height, frames, fps = 6,
    label = '', fallbackAsset = null, shadow = true, flipX = false
  }) {
    this.x = x;
    this.y = y;
    this.height = height;
    this.frames = frames;
    this.fps = fps;
    this.label = label;
    this.fallbackAsset = fallbackAsset;
    this.shadow = shadow;
    this.flipX = flipX;
    this.frameIndex = 0;
    this.animTimer = 0;
    this.speedFactor = 1; // 0 = đứng yên, 1 = chạy tốc độ chuẩn
  }

  advanceFrame(dt, rateMultiplier = 1) {
    if (!this.frames || this.frames.length <= 1) return;
    if (rateMultiplier <= 0.05) {
      this.frameIndex = 0;
      this.animTimer = 0;
      return;
    }
    this.animTimer += dt * this.fps * rateMultiplier;
    if (this.animTimer >= 1) {
      const steps = Math.floor(this.animTimer);
      this.animTimer -= steps;
      this.frameIndex = (this.frameIndex + steps) % this.frames.length;
    }
  }

  update(dt) {
    this.advanceFrame(dt, this.speedFactor);
  }

  draw(ctx, assets) {
    const file = this.frames[this.frameIndex];
    const sprite = assets.get(file) || (this.fallbackAsset ? assets.get(this.fallbackAsset) : null);
    if (!sprite) return;

    const nw = sprite.naturalWidth || sprite.width || 1;
    const nh = sprite.naturalHeight || sprite.height || 1;
    const drawH = this.height;
    const drawW = drawH * (nw / nh);

    if (this.shadow) {
      ctx.save();
      ctx.fillStyle = 'rgba(74, 40, 14, 0.22)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, Math.max(12, drawW * 0.38), Math.max(5, drawH * 0.11), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.flipX) ctx.scale(-1, 1);
    ctx.drawImage(sprite, -drawW / 2, -drawH, drawW, drawH);
    ctx.restore();
  }
}

/**
 * Bộ di chuyển theo chuỗi điểm dừng (waypoints) với tăng tốc / giảm tốc mượt trên từng chặng
 */
class SmoothPathEntity extends AnimatedEntity {
  constructor(opts) {
    super(opts);
    this.waypoints = [];
    this.segStartX = opts.x;
    this.segStartY = opts.y;
    this.segTargetX = opts.x;
    this.segTargetY = opts.y;
    this.segElapsed = 0;
    this.segDuration = 1;
    this.pauseTimer = 0;
    this.moveSpeed = opts.moveSpeed || 72;
    this.onRouteFinished = null;
  }

  setRoute(points, onFinished = null) {
    this.waypoints = points.map((p) => ({ x: p.x, y: p.y, pause: p.pause || 0 }));
    this.onRouteFinished = onFinished;
    this.startNextSegment();
  }

  startNextSegment() {
    if (this.waypoints.length === 0) {
      this.speedFactor = 0;
      if (this.onRouteFinished) {
        const cb = this.onRouteFinished;
        this.onRouteFinished = null;
        cb();
      }
      return;
    }
    const next = this.waypoints.shift();
    this.segStartX = this.x;
    this.segStartY = this.y;
    this.segTargetX = next.x;
    this.segTargetY = next.y;
    this.segPauseAfter = next.pause || 0;
    const dist = Math.hypot(this.segTargetX - this.segStartX, this.segTargetY - this.segStartY);
    this.segDuration = Math.max(0.28, dist / this.moveSpeed);
    this.segElapsed = 0;

    if (Math.abs(this.segTargetX - this.segStartX) > 3) {
      this.flipX = this.segTargetX < this.segStartX;
    }
  }

  update(dt) {
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.speedFactor = 0;
      this.advanceFrame(dt, 0);
      if (this.pauseTimer <= 0) {
        this.startNextSegment();
      }
      return;
    }

    if (this.segDuration > 0) {
      this.segElapsed += dt;
      const t = Math.min(1, this.segElapsed / this.segDuration);
      const eased = easeInOutSmooth(t);
      this.x = this.segStartX + (this.segTargetX - this.segStartX) * eased;
      this.y = this.segStartY + (this.segTargetY - this.segStartY) * eased;

      // Tốc độ khung hình khớp với vận tốc tức thời
      const velNorm = easeInOutSpeedFactor(t);
      this.speedFactor = 0.25 + velNorm * 1.15;
      this.advanceFrame(dt, this.speedFactor);

      if (t >= 1) {
        this.x = this.segTargetX;
        this.y = this.segTargetY;
        if (this.segPauseAfter > 0) {
          this.pauseTimer = this.segPauseAfter;
        } else {
          this.startNextSegment();
        }
      }
    }
  }
}

/**
 * Nhân viên kho: đi mượt giữa Kho Kệ hàng (lấy hàng -> bê thùng) qua cửa thông phòng xuống Khu Đóng gói
 */
class WorkerEntity extends SmoothPathEntity {
  constructor(x, y, index = 0) {
    super({
      x, y,
      height: 54,
      frames: ASSET_MANIFEST.animations.workerWalk,
      fps: 7.5,
      moveSpeed: 76 + (index % 3) * 6,
      label: 'Kho',
      fallbackAsset: 'worker-warehouse.png'
    });
    this.index = index;
    this.carrying = false;
    this.planNextTrip();
  }

  planNextTrip() {
    this.carrying = !this.carrying;
    this.frames = this.carrying
      ? ASSET_MANIFEST.animations.workerCarry
      : ASSET_MANIFEST.animations.workerWalk;
    this.fps = this.carrying ? 5.5 : 7.8;
    this.frameIndex = 0;

    const jitterX = (Math.random() - 0.5) * 38;
    const doorX = 630 + (this.index % 2 === 0 ? -10 : 10);

    if (this.carrying) {
      // Từ Kho Kệ hàng -> qua cửa thông phòng -> bàn đóng gói ở Khu Đóng gói
      const packX = Math.random() < 0.5 ? 640 + jitterX * 0.5 : 715 + jitterX * 0.4;
      const packY = 338 + Math.random() * 44;
      this.setRoute(
        [
          { x: doorX, y: 224, pause: 0 },
          { x: doorX, y: 298, pause: 0 },
          { x: packX, y: packY, pause: 0.65 }
        ],
        () => this.planNextTrip()
      );
    } else {
      // Từ Khu Đóng gói -> quay lại Kho Kệ hàng (hoặc sang Khu Nhập hàng lấy đồ)
      const goReceiving = Math.random() < 0.25;
      if (goReceiving) {
        this.setRoute(
          [
            { x: doorX, y: 294, pause: 0 },
            { x: doorX, y: 212, pause: 0 },
            { x: 454, y: 186, pause: 0 },
            { x: 356 + jitterX * 0.5, y: 186 + Math.random() * 24, pause: 0.7 },
            { x: 454, y: 186, pause: 0 },
            { x: 540 + Math.random() * 140, y: 196, pause: 0.4 }
          ],
          () => this.planNextTrip()
        );
      } else {
        const shelfX = 515 + Math.random() * 210;
        const shelfY = 186 + Math.random() * 24;
        this.setRoute(
          [
            { x: doorX, y: 294, pause: 0 },
            { x: doorX, y: 222, pause: 0 },
            { x: shelfX, y: shelfY, pause: 0.6 }
          ],
          () => this.planNextTrip()
        );
      }
    }
  }
}

/**
 * Tài xế: đi kiểm hàng mượt giữa cửa Khu Đóng gói, bảng tuyến đường và bãi xe Khu Giao hàng
 */
class DriverEntity extends SmoothPathEntity {
  constructor(x, y, index = 0) {
    super({
      x, y,
      height: 54,
      frames: ASSET_MANIFEST.animations.driverWalk,
      fps: 6.8,
      moveSpeed: 58 + (index % 2) * 8,
      label: 'Tài xế',
      fallbackAsset: 'driver.png'
    });
    this.index = index;
    this.planPatrol();
  }

  planPatrol() {
    const spots = [
      { x: 846 + Math.random() * 34, y: 342 + Math.random() * 36, pause: 0.8 },
      { x: 912 + Math.random() * 28, y: 312 + Math.random() * 26, pause: 0.9 },
      { x: 944 + Math.random() * 30, y: 378 + Math.random() * 18, pause: 0.7 }
    ];
    const target = spots[Math.floor(Math.random() * spots.length)];
    this.setRoute([target], () => this.planPatrol());
  }
}

/**
 * Xe nâng trong Khu Nhập hàng: di chuyển êm có tăng tốc / giảm tốc giữa cửa cuốn và bãi pallet
 */
class ForkliftEntity extends SmoothPathEntity {
  constructor(x, y) {
    super({
      x, y,
      height: 62,
      frames: ASSET_MANIFEST.animations.forklift,
      fps: 4.5,
      moveSpeed: 56,
      label: 'Xe nâng',
      fallbackAsset: 'forklift.png'
    });
    this.active = true;
    this.toRight = true;
    this.planCycle();
  }

  planCycle() {
    this.toRight = !this.toRight;
    const target = this.toRight
      ? { x: 342, y: 214, pause: 0.95 }
      : { x: 204, y: 214, pause: 0.95 };
    this.setRoute([target], () => this.planCycle());
  }

  update(dt) {
    if (!this.active) {
      this.frameIndex = 0;
      return;
    }
    super.update(dt);
  }
}

/**
 * Xe tải nhà cung cấp chạy mượt vào cửa cuốn khi giao hàng mới
 */
class IncomingSupplyTruck extends AnimatedEntity {
  constructor({ onArrive }) {
    super({
      x: -55, y: 204,
      height: 92,
      frames: ASSET_MANIFEST.animations.truckSmall,
      fps: 9,
      label: 'Xe nhập hàng',
      fallbackAsset: 'truck-small.png',
      flipX: false
    });
    this.startX = -55;
    this.dockX = 84;
    this.phase = 'in'; // 'in' -> 'unload' -> 'out'
    this.timer = 0;
    this.onArrive = onArrive;
    this.done = false;
  }

  update(dt) {
    this.timer += dt;
    if (this.phase === 'in') {
      const t = Math.min(1, this.timer / 1.3);
      // Lùi thùng hàng êm vào cửa cuốn (ease-out cubic)
      const eased = 1 - Math.pow(1 - t, 3);
      this.x = this.startX + (this.dockX - this.startX) * eased;
      this.advanceFrame(dt, Math.max(0.2, 1.2 * (1 - t)));
      if (t >= 1) {
        this.phase = 'unload';
        this.timer = 0;
        if (this.onArrive) this.onArrive();
      }
    } else if (this.phase === 'unload') {
      this.advanceFrame(dt, 0);
      if (this.timer >= 1.1) {
        this.phase = 'out';
        this.timer = 0;
      }
    } else {
      const t = Math.min(1, this.timer / 1.2);
      // Tăng tốc êm khi rời bến ra đường bên trái (ease-in quad)
      const eased = t * t;
      this.x = this.dockX + (this.startX - this.dockX) * eased;
      this.advanceFrame(dt, 0.3 + eased * 1.1);
      if (t >= 1) this.done = true;
    }
  }
}

/**
 * Xe giao hàng xuất bến từ Khu Giao hàng:
 * - Tăng tốc mượt rời bãi đỗ (ease-in) -> lướt trơn ra đường nhựa bên phải -> giao xong quay về mượt (ease-out)!
 */
class VehicleEntity extends AnimatedEntity {
  constructor({ type, x, y, orders, zone, onComplete }) {
    const cfg = VEHICLE_TYPES[type];
    const heights = { bike: 56, truckSmall: 72, truckLarge: 80 };
    super({
      x, y,
      height: heights[type] || 66,
      frames: ASSET_MANIFEST.animations[cfg.animKey],
      fps: 11,
      label: cfg.name,
      fallbackAsset: cfg.idleAsset,
      flipX: true
    });
    this.type = type;
    this.speed = cfg.speed;
    this.orders = orders;
    this.zone = zone;
    this.onComplete = onComplete;
    this.done = false;
    this.progress = 0;

    this.startX = x;
    this.startY = y;
    this.exitX = 1340;
    this.laneY = type === 'bike' ? 378 : 346;
  }

  update(dt) {
    const distMult = this.zone ? this.zone.distanceMult : 1;
    const travelSec = (4.8 * distMult) * (120 / this.speed);
    this.progress += dt / travelSec;

    const p = Math.min(1, Math.max(0, this.progress));
    // Giai đoạn 1 (0 -> 0.52): tăng tốc mượt chạy ra khỏi bãi giao hàng sang phải
    // Giai đoạn 2 (0.52 -> 0.64): giao hàng ngoài tuyến
    // Giai đoạn 3 (0.64 -> 1.0): xe quay đầu chạy êm về bến
    if (p <= 0.52) {
      const t = p / 0.52;
      const eased = t < 0.35 ? (t / 0.35) * (t / 0.35) * 0.25 : 0.25 + ((t - 0.35) / 0.65) * 0.75;
      this.x = this.startX + (this.exitX - this.startX) * eased;
      this.y = this.startY + (this.laneY - this.startY) * Math.min(1, t * 2.5);
      this.flipX = true;
      const speedRatio = t < 0.35 ? 0.4 + t * 2 : 1.15;
      this.advanceFrame(dt, speedRatio);
    } else if (p <= 0.64) {
      this.x = this.exitX + 40;
      this.advanceFrame(dt, 0.8);
    } else {
      const t = (p - 0.64) / 0.36;
      // Giảm tốc êm khi về tới bãi (ease-out)
      const eased = 1 - Math.pow(1 - t, 2.4);
      this.x = this.exitX + (this.startX - this.exitX) * eased;
      this.y = this.laneY + (this.startY - this.laneY) * eased;
      this.flipX = false;
      this.advanceFrame(dt, Math.max(0.25, (1 - t) * 1.25));
    }

    if (this.progress >= 1) {
      this.done = true;
      if (this.onComplete) this.onComplete(this);
    }
  }

  draw(ctx, assets) {
    super.draw(ctx, assets);
    // Thẻ mã đơn hàng bay gọn phía trên xe khi xe đang trong màn hình
    if (this.x > 820 && this.x < 1245 && this.orders && this.orders.length > 0) {
      const tag = this.orders.map((o) => `#${o.id}`).join(',');
      ctx.save();
      ctx.font = '800 10.5px Nunito, sans-serif';
      const tw = ctx.measureText(tag).width + 12;
      const ty = this.y - this.height - 14;
      ctx.fillStyle = 'rgba(22, 163, 74, 0.92)';
      ctx.beginPath();
      ctx.roundRect(this.x - tw / 2, ty, tw, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, this.x, ty + 8.5);
      ctx.restore();
    }
  }
}

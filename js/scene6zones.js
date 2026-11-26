/**
 * Scene6ZonesRenderer — v1.4: Lớp Canvas 60fps trong suốt phủ trên nền ảnh hub-scene.png
 * - Giữ hệ tọa độ thế giới 1260x540 để tái sử dụng nguyên bản SmoothPathEntity / WorkerEntity /
 *   DriverEntity / ForkliftEntity / IncomingSupplyTruck / VehicleEntity trong entities.js.
 * - Tách bạch hoàn toàn vòng vẽ 60fps với vòng logic, KHÔNG vẽ lại nền tĩnh không cần thiết.
 */
const WORLD_W = 1260;
const WORLD_H = 540;

const ZONE_DEFS = [
  {
    id: 'receiving',
    num: 1,
    name: 'Khu 1 · Nhập hàng',
    shortName: 'Nhập hàng',
    icon: '🚛',
    tabId: 'tab-supplier',
    dockTab: 'suppliers',
    heroImg: 'zone-nhap-hang.png',
    subtitle: '3 Nhà cung cấp A/B/C • Nhập hàng vào Kho dự trữ & Vật tư đóng gói',
    accent: '#EA580C'
  },
  {
    id: 'shelves',
    num: 2,
    name: 'Khu 2 · Kho Kệ hàng',
    shortName: 'Kho Kệ hàng',
    icon: '🗄️',
    tabId: 'tab-pick',
    dockTab: 'warehouse',
    heroImg: 'zone-kho.png',
    subtitle: 'Quản lý 6 mặt hàng trên kệ X/12 • Châm từ Kho dự trữ & theo dõi HSD',
    accent: '#0D9488'
  },
  {
    id: 'packing',
    num: 3,
    name: 'Khu 3 · Đóng gói',
    shortName: 'Đóng gói',
    icon: '📦',
    tabId: 'tab-pack',
    dockTab: 'orders',
    heroImg: 'zone-dong-goi.png',
    subtitle: 'Vật tư thùng/băng dính/túi lạnh • Đơn chờ đóng gói & 2 bàn đóng gói',
    accent: '#4F46E5'
  },
  {
    id: 'dispatch',
    num: 4,
    name: 'Khu 4 · Giao hàng',
    shortName: 'Giao hàng',
    icon: '🚚',
    tabId: 'tab-dispatch',
    dockTab: 'orders',
    heroImg: 'zone-giao-hang.png',
    subtitle: 'Phối xe máy / xe tải • Theo dõi xe đang giao & Bản đồ tuyến giao hàng',
    accent: '#0284C7'
  },
  {
    id: 'office',
    num: 5,
    name: 'Khu 5 · Văn phòng',
    shortName: 'Văn phòng',
    icon: '🏢',
    tabId: 'tab-office',
    dockTab: 'office',
    heroImg: 'zone-van-phong.png',
    subtitle: 'Tổng quan trung tâm • Mốc mở khóa, Nhật ký vận hành, Lưu game & Kết thúc ngày',
    accent: '#334155'
  },
  {
    id: 'orders',
    num: 6,
    name: 'Khu 6 · Quầy Đơn hàng',
    shortName: 'Quầy Đơn hàng',
    icon: '📋',
    tabId: 'tab-orders',
    dockTab: 'orders',
    heroImg: 'zone-quay-don.png',
    subtitle: 'Tiếp nhận đơn mới • Soạn hàng theo lô, đóng gói và điều phối xuất bến',
    accent: '#DC2626'
  }
];

class Scene6ZonesRenderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.zones = ZONE_DEFS;

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = 1;
    this.cssWidth = WORLD_W;
    this.cssHeight = WORLD_H;

    this.hoveredZoneId = null;
    this.activeZoneId = null;
    this.clickRipple = null;
    this.bellPulse = 0;
    this.time = 0;
    this.floatingTexts = [];

    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const rect = parent
      ? parent.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    const cssW = Math.max(320, Math.round(rect.width));
    const cssH = Math.max(180, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.cssWidth = cssW;
    this.cssHeight = cssH;
    this.dpr = dpr;

    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    // Giữ tỉ lệ nguyên bản để nhân vật & xe không bao giờ bị kéo méo
    const scaleX = cssW / WORLD_W;
    const scaleY = cssH / WORLD_H;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (cssW - WORLD_W * this.scale) / 2;
    this.offsetY = (cssH - WORLD_H * this.scale) / 2;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale
    };
  }

  hitTestZone() {
    // Tương tác 6 khu v1.4 xử lý trực tiếp bằng các nút .zone-hotspot đồng bộ tọa độ với hub-scene.png
    return null;
  }

  triggerClickRipple(zoneId, worldX, worldY) {
    this.clickRipple = { zoneId, x: worldX, y: worldY, t: 0 };
  }

  triggerBellPulse() {
    this.bellPulse = 1.0;
  }

  addFloatingText(x, y, text, color = '#059669') {
    this.floatingTexts.push({ x, y, text, color, life: 0, maxLife: 1.55 });
  }

  updateEffects(dt) {
    this.time += dt;
    if (this.bellPulse > 0) {
      this.bellPulse = Math.max(0, this.bellPulse - dt * 1.35);
    }
    if (this.clickRipple) {
      this.clickRipple.t += dt * 2.6;
      if (this.clickRipple.t >= 1) this.clickRipple = null;
    }
    for (const ft of this.floatingTexts) {
      ft.life += dt;
      ft.y -= 28 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life < ft.maxLife);
  }

  roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  getZoneBadgeText(z, game) {
    switch (z.id) {
      case 'receiving': {
        const pend = game.state.pendingDeliveries.length;
        return pend > 0 ? `${pend} đang về` : '3 NCC';
      }
      case 'shelves': {
        const coldUnlocked = game.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;
        const activeProds = PRODUCTS.filter((p) => !p.cold || coldUnlocked);
        const total = activeProds.reduce((s, p) => s + game.getStockCount(p.id), 0);
        const max = activeProds.length * GAME_CONFIG.shelfCapacity;
        return `${total}/${max}`;
      }
      case 'office': {
        const staffCount = game.state.staff.workers + game.state.staff.drivers;
        return game.state.bank.loan > 0 ? `Nợ $${game.state.bank.loan}` : `${staffCount} NV`;
      }
      case 'orders': {
        return `${game.state.orders.length} đơn`;
      }
      case 'packing': {
        const wait = game.state.orders.filter((o) => o.status === 'ready_to_pack').length;
        const busy = game.state.packingTables.filter((t) => t.orderId !== null).length;
        return busy > 0 ? `Gói ${busy}` : `${wait} chờ`;
      }
      case 'dispatch': {
        const moving = game.activeVehicles.length;
        const packed = game.state.orders.filter((o) => o.status === 'packed').length;
        return moving > 0 ? `${moving} xe chạy` : packed > 0 ? `${packed} chờ` : 'Sẵn sàng';
      }
      default:
        return '';
    }
  }

  render(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.scale(this.dpr, this.dpr);

    // Chuyển sang hệ tọa độ thế giới 1260x540 (căn khớp tầng trệt & bãi xe của hub-scene.png)
    ctx.translate(this.offsetX + 98 * this.scale, this.offsetY + 104 * this.scale);
    ctx.scale(this.scale * 0.80, this.scale * 0.80);

    // 1. Vẽ toàn bộ thực thể động 60fps sắp xếp theo chiều sâu Y
    const dynamicEntities = [
      game.conveyor,
      game.forklift,
      ...game.workers,
      ...game.drivers,
      ...game.receivingTrucks,
      ...game.activeVehicles
    ].filter(Boolean).sort((a, b) => a.y - b.y);

    for (const ent of dynamicEntities) {
      ent.draw(ctx, this.assets);
    }

    // 2. Thanh tiến độ trực tiếp khi bàn đóng gói đang chạy
    const tableMarkers = [
      { id: 1, x: 520, y: 382 },
      { id: 2, x: 612, y: 416 }
    ];
    for (const tm of tableMarkers) {
      const tableState = game.state.packingTables.find((t) => t.id === tm.id);
      if (tableState && tableState.orderId !== null) {
        const pct = Math.min(1, tableState.progress / 100);
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        this.roundRectPath(ctx, tm.x - 42, tm.y - 24, 84, 18, 9);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#2563EB';
        this.roundRectPath(ctx, tm.x - 39, tm.y - 21, Math.max(8, 78 * pct), 12, 6);
        ctx.fill();

        ctx.fillStyle = '#0F172A';
        ctx.font = '800 10.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Đơn #${tableState.orderId} · ${Math.floor(pct * 100)}%`, tm.x, tm.y - 29);
        ctx.restore();
      }
    }

    // 3. Sóng chuông khi có đơn mới ở Quầy Đơn hàng
    if (this.bellPulse > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(220, 38, 38, ${this.bellPulse * 0.85})`;
      ctx.lineWidth = 3;
      const r = 14 + (1 - this.bellPulse) * 44;
      ctx.beginPath();
      ctx.arc(815, 345, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Hiệu ứng sóng chạm khi bấm vào khu vực
    if (this.clickRipple) {
      const t = this.clickRipple.t;
      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.clickRipple.x, this.clickRipple.y, 12 + t * 75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Hiệu ứng chữ bay (+$ / +sp)
    for (const ft of this.floatingTexts) {
      const alpha = 1 - Math.pow(ft.life / ft.maxLife, 1.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = '900 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 6. Ánh sáng chiều tà / buổi tối siêu nhẹ theo chu kỳ ngày
    const progress = game.state.dayElapsed / GAME_CONFIG.dayDurationSec;
    if (progress > 0.78) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(-100, -100, WORLD_W + 200, WORLD_H + 200);
    } else if (progress > 0.58) {
      ctx.fillStyle = 'rgba(234, 88, 12, 0.06)';
      ctx.fillRect(-100, -100, WORLD_W + 200, WORLD_H + 200);
    }

    ctx.restore();
  }
}

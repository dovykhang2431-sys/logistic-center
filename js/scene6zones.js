/**
 * Scene6ZonesRenderer — Diện mạo v1.3: Tòa nhà dollhouse isometric cắt mở gồm 6 khu vực riêng biệt.
 * Tọa độ chuẩn 1260 x 540 (tỉ lệ 21:9 ngang điện thoại), tự động căn giữa không méo hình,
 * chừa vùng an toàn cho HUD chip phía trên (y < 62) và dải thẻ đơn phía dưới (y > 432).
 */
const WORLD_W = 1260;
const WORLD_H = 540;

const ZONE_DEFS = [
  {
    id: 'receiving',
    name: 'Khu Nhập hàng',
    icon: '🚛',
    tabId: 'tab-supplier',
    row: 0, col: 0,
    x: 112, y: 74, w: 336, h: 162, wallH: 46,
    accent: '#d97706',
    glow: 'rgba(245, 158, 11, 0.55)',
    wallBg: '#f6d5a8',
    wallTrim: '#e5a85c',
    floorBg: '#fdf0d5',
    floorTile: 'rgba(217, 119, 6, 0.13)',
    chipBg: '#fffbeb',
    chipBadgeBg: '#fef3c7',
    chipBadgeColor: '#92400e'
  },
  {
    id: 'shelves',
    name: 'Kho Kệ hàng',
    icon: '🗄️',
    tabId: 'tab-pick',
    row: 0, col: 1,
    x: 462, y: 74, w: 336, h: 162, wallH: 46,
    accent: '#0d9488',
    glow: 'rgba(20, 184, 166, 0.55)',
    wallBg: '#bcebe0',
    wallTrim: '#7cd4c1',
    floorBg: '#e2f8f2',
    floorTile: 'rgba(13, 148, 136, 0.13)',
    chipBg: '#f0fdfa',
    chipBadgeBg: '#ccfbf1',
    chipBadgeColor: '#115e59'
  },
  {
    id: 'office',
    name: 'Văn phòng',
    icon: '🏢',
    tabId: 'office-combined',
    row: 0, col: 2,
    x: 812, y: 74, w: 336, h: 162, wallH: 46,
    accent: '#7c3aed',
    glow: 'rgba(139, 92, 246, 0.55)',
    wallBg: '#e3d9fb',
    wallTrim: '#c4b1f5',
    floorBg: '#f2dec0',
    floorTile: 'rgba(124, 58, 237, 0.11)',
    chipBg: '#f5f3ff',
    chipBadgeBg: '#ede9fe',
    chipBadgeColor: '#5b21b6'
  },
  {
    id: 'orders',
    name: 'Quầy Đơn hàng',
    icon: '📋',
    tabId: 'tab-orders',
    row: 1, col: 0,
    x: 112, y: 248, w: 336, h: 164, wallH: 40,
    accent: '#e11d48',
    glow: 'rgba(244, 63, 94, 0.52)',
    wallBg: '#fcd2c7',
    wallTrim: '#f29e8d',
    floorBg: '#fff1ed',
    floorTile: 'rgba(225, 29, 72, 0.11)',
    chipBg: '#fff1f2',
    chipBadgeBg: '#ffe4e6',
    chipBadgeColor: '#9f1239'
  },
  {
    id: 'packing',
    name: 'Khu Đóng gói',
    icon: '📦',
    tabId: 'tab-pack',
    row: 1, col: 1,
    x: 462, y: 248, w: 336, h: 164, wallH: 40,
    accent: '#2563eb',
    glow: 'rgba(59, 130, 246, 0.55)',
    wallBg: '#c5e2fc',
    wallTrim: '#8ec0f7',
    floorBg: '#eaf4ff',
    floorTile: 'rgba(37, 99, 235, 0.12)',
    chipBg: '#eff6ff',
    chipBadgeBg: '#dbeafe',
    chipBadgeColor: '#1e40af'
  },
  {
    id: 'dispatch',
    name: 'Khu Giao hàng',
    icon: '🚚',
    tabId: 'tab-dispatch',
    row: 1, col: 2,
    x: 812, y: 248, w: 336, h: 164, wallH: 40,
    accent: '#16a34a',
    glow: 'rgba(34, 197, 94, 0.55)',
    wallBg: '#c4ecc2',
    wallTrim: '#81d47e',
    floorBg: '#e2f7de',
    floorTile: 'rgba(22, 163, 74, 0.13)',
    chipBg: '#f0fdf4',
    chipBadgeBg: '#dcfce7',
    chipBadgeColor: '#166534'
  }
];

class Scene6ZonesRenderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.zones = ZONE_DEFS;

    // Camera transform để giữ đúng tỷ lệ 21:9 trên mọi kích thước màn hình
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = 1;
    this.cssWidth = WORLD_W;
    this.cssHeight = WORLD_H;

    this.hoveredZoneId = null;
    this.activeZoneId = null;
    this.clickRipple = null; // { zoneId, x, y, t }
    this.bellPulse = 0;      // rung chuông khi có đơn mới
    this.time = 0;
    this.floatingTexts = []; // { x, y, text, color, life, maxLife }

    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement
      ? this.canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    const cssW = Math.max(320, Math.round(rect.width));
    const cssH = Math.max(200, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.cssWidth = cssW;
    this.cssHeight = cssH;
    this.dpr = dpr;

    if (this.canvas.width !== Math.round(cssW * dpr) || this.canvas.height !== Math.round(cssH * dpr)) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }

    // Fit toàn bộ thế giới 1260x540 vào viewport, không cắt khu nào
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

  hitTestZone(clientX, clientY) {
    const pt = this.screenToWorld(clientX, clientY);
    // Ưu tiên kiểm tra chip nhãn trước (hàng trước rồi hàng sau) để bấm vào chip mở đúng khu
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      const chipTop = z.row === 0 ? z.y - 18 : z.y - 17;
      if (pt.x >= z.x && pt.x <= z.x + z.w && pt.y >= chipTop && pt.y <= z.y + z.h) {
        return z;
      }
    }
    return null;
  }

  triggerClickRipple(zoneId, worldX, worldY) {
    this.clickRipple = { zoneId, x: worldX, y: worldY, t: 0 };
  }

  triggerBellPulse() {
    this.bellPulse = 1.0;
  }

  addFloatingText(x, y, text, color = '#15803d') {
    this.floatingTexts.push({ x, y, text, color, life: 0, maxLife: 1.5 });
  }

  updateEffects(dt) {
    this.time += dt;
    if (this.bellPulse > 0) {
      this.bellPulse = Math.max(0, this.bellPulse - dt * 1.4);
    }
    if (this.clickRipple) {
      this.clickRipple.t += dt * 2.8;
      if (this.clickRipple.t >= 1) this.clickRipple = null;
    }
    for (const ft of this.floatingTexts) {
      ft.life += dt;
      ft.y -= 26 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life < ft.maxLife);
  }

  // ===== HÀM HỖ TRỢ VẼ HÌNH HỌC CARTOON =====
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

  drawSpriteKeepAspect(ctx, filename, cx, bottomY, targetHeight, flipX = false, alpha = 1) {
    const img = this.assets.get(filename);
    if (!img) return;
    const nw = img.naturalWidth || img.width || 1;
    const nh = img.naturalHeight || img.height || 1;
    const drawH = targetHeight;
    const drawW = drawH * (nw / nh);

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(cx, bottomY);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
    ctx.restore();
  }

  drawGroundShadow(ctx, cx, cy, rx, ry, alpha = 0.2) {
    ctx.save();
    ctx.fillStyle = `rgba(74, 40, 14, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ===== VẼ TOÀN CẢNH 6 KHU VỰC =====
  render(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Nền sân vườn ấm áp toàn màn hình (không bao giờ hở viền đen)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.cssHeight);
    skyGrad.addColorStop(0, '#fbe6bd');
    skyGrad.addColorStop(0.45, '#f2d8a7');
    skyGrad.addColorStop(1, '#d7e6a3');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    // Chuyển sang hệ tọa độ thế giới 1260x540
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 2. Bối cảnh bên ngoài tòa nhà: cỏ, đường nhập hàng bên trái, đường giao hàng bên phải, bụi cây
    this.drawExteriorGround(ctx, game);

    // 3. Khung nền 3D cắt mở (bệ móng dollhouse & bóng đổ)
    this.drawBuildingShell(ctx);

    // 4. Sàn + tường màu riêng + lưới gạch isometric cho từng phòng (hàng sau -> hàng trước)
    for (const z of this.zones) {
      this.drawZoneRoomBase(ctx, z);
    }

    // 5. Cửa thông phòng giữa các khu vực
    this.drawInteriorDoorways(ctx);

    // 6. Đồ đạc tĩnh đặc trưng từng khu (hàng sau)
    this.drawReceivingDecor(ctx, game);
    this.drawShelvesDecor(ctx, game);
    this.drawOfficeDecor(ctx, game);

    // 7. Vách ngăn cắt mở giữa hàng sau & hàng trước (nổi 3D)
    this.drawMidCutawayWall(ctx);

    // 8. Đồ đạc tĩnh đặc trưng từng khu (hàng trước)
    this.drawOrdersDecor(ctx, game);
    this.drawPackingDecor(ctx, game);
    this.drawDispatchDecor(ctx, game);

    // 9. Các thực thể động 60fps sắp xếp theo chiều sâu Y (nhân viên, xe nâng, băng chuyền, tài xế, xe giao hàng)
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

    // 10. Bờ tường cắt mở mặt trước + viền sáng bấm được cho 6 khu
    this.drawFrontCutawayRim(ctx);
    for (const z of this.zones) {
      this.drawZoneGlowAndRipple(ctx, z);
    }

    // 11. Nhãn tên 6 khu dạng chip nổi bật + số liệu trực tiếp
    for (const z of this.zones) {
      this.drawZoneChip(ctx, z, game);
    }

    // 12. Hiệu ứng chữ bay (+$ / +sp)
    this.drawFloatingTexts(ctx);

    // 13. Ánh sáng hoàng hôn / tối nhẹ theo chu kỳ ngày (chỉ phủ nhẹ không làm mờ chữ)
    const progress = game.state.dayElapsed / GAME_CONFIG.dayDurationSec;
    if (progress > 0.78) {
      ctx.fillStyle = 'rgba(22, 34, 72, 0.20)';
      ctx.fillRect(-200, -200, WORLD_W + 400, WORLD_H + 400);
    } else if (progress > 0.58) {
      ctx.fillStyle = 'rgba(244, 122, 42, 0.09)';
      ctx.fillRect(-200, -200, WORLD_W + 400, WORLD_H + 400);
    }

    ctx.restore();
  }

  drawExteriorGround(ctx, game) {
    // Vạt cỏ xanh pastel bao quanh khu logistics
    ctx.fillStyle = '#c8e498';
    ctx.fillRect(-120, 48, WORLD_W + 240, 460);

    // Vệt nắng ấm góc trên trái
    const sunGlow = ctx.createRadialGradient(140, 30, 10, 140, 30, 380);
    sunGlow.addColorStop(0, 'rgba(255, 245, 200, 0.45)');
    sunGlow.addColorStop(1, 'rgba(255, 245, 200, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(-120, -60, 620, 420);

    // Đường nhựa nhập hàng bên trái (nối vào cửa cuốn Khu Nhập hàng)
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(-120, 118, 232, 110);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(-120, 114, 232, 5);
    ctx.fillRect(-120, 226, 232, 5);
    // Vạch kẻ đường đứt khúc bên trái
    ctx.save();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(-100, 173);
    ctx.lineTo(100, 173);
    ctx.stroke();
    ctx.restore();

    // Đường nhựa giao hàng bên phải (xe xuất bến chạy mượt ra ngoài)
    ctx.fillStyle = '#64748b';
    ctx.fillRect(1148, 286, 240, 126);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(1148, 282, 240, 5);
    ctx.fillRect(1148, 410, 240, 5);
    // Vạch kẻ đường đứt khúc bên phải
    ctx.save();
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(1152, 349);
    ctx.lineTo(1360, 349);
    ctx.stroke();
    ctx.restore();

    // Lối đi lát gạch vào Quầy Đơn hàng phía trước trái
    ctx.fillStyle = '#f3d8b0';
    this.roundRectPath(ctx, 18, 304, 94, 72, 12);
    ctx.fill();
    ctx.strokeStyle = '#b78349';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bụi cây trang trí dễ thương phong cách 3D cartoon
    const drawBush = (bx, by, s) => {
      this.drawGroundShadow(ctx, bx, by + 10 * s, 22 * s, 8 * s, 0.18);
      ctx.fillStyle = '#5da949';
      ctx.strokeStyle = '#3b5c2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx - 10 * s, by + 2 * s, 12 * s, 0, Math.PI * 2);
      ctx.arc(bx + 10 * s, by + 3 * s, 11 * s, 0, Math.PI * 2);
      ctx.arc(bx, by - 5 * s, 14 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Đốm sáng lá non
      ctx.fillStyle = '#93d66b';
      ctx.beginPath();
      ctx.arc(bx - 4 * s, by - 9 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
    };

    drawBush(48, 92, 1.05);
    drawBush(46, 266, 0.95);
    drawBush(54, 404, 1.0);
    drawBush(1206, 98, 1.1);
    drawBush(1212, 232, 1.0);
  }

  drawBuildingShell(ctx) {
    // Bóng đổ tổng thể của khối dollhouse xuống sân
    ctx.save();
    ctx.fillStyle = 'rgba(74, 40, 14, 0.22)';
    this.roundRectPath(ctx, 108, 78, 1054, 358, 18);
    ctx.fill();
    ctx.restore();

    // Khối tường ngoài màu kem gỗ ấm áp (kiểu mô hình dollhouse cắt mở)
    ctx.save();
    ctx.fillStyle = '#fff5e1';
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 3.5;
    this.roundRectPath(ctx, 102, 65, 1056, 362, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawZoneRoomBase(ctx, z) {
    const floorY = z.y + z.wallH;
    const floorH = z.h - z.wallH;

    ctx.save();
    // Clip trong phạm vi phòng
    this.roundRectPath(ctx, z.x, z.y, z.w, z.h, 8);
    ctx.clip();

    // 1. Tường hậu phòng (màu riêng của khu)
    ctx.fillStyle = z.wallBg;
    ctx.fillRect(z.x, z.y, z.w, z.wallH);

    // Dải chân tường (wainscoting) tạo chiều sâu kiến trúc
    ctx.fillStyle = z.wallTrim;
    ctx.fillRect(z.x, z.y + z.wallH - 12, z.w, 12);

    // Đường viền chân tường
    ctx.strokeStyle = 'rgba(74, 40, 14, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(z.x, floorY);
    ctx.lineTo(z.x + z.w, floorY);
    ctx.stroke();

    // 2. Sàn nhà màu riêng
    ctx.fillStyle = z.floorBg;
    ctx.fillRect(z.x, floorY, z.w, floorH);

    // Gạch sàn isometric chéo góc 26.5° (tạo chiều sâu isometric dollhouse rõ rệt)
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.x, floorY, z.w, floorH);
    ctx.clip();
    ctx.strokeStyle = z.floorTile;
    ctx.lineWidth = 1.25;
    const step = 36;
    for (let sx = z.x - floorH * 2; sx < z.x + z.w + floorH * 2; sx += step) {
      ctx.beginPath();
      ctx.moveTo(sx, floorY);
      ctx.lineTo(sx + floorH * 1.75, floorY + floorH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, floorY);
      ctx.lineTo(sx - floorH * 1.75, floorY + floorH);
      ctx.stroke();
    }
    ctx.restore();

    // Bóng đổ nhẹ từ tường hậu & tường trái xuống sàn (ambient occlusion 3D)
    const wallShadow = ctx.createLinearGradient(0, floorY, 0, floorY + 18);
    wallShadow.addColorStop(0, 'rgba(74, 40, 14, 0.14)');
    wallShadow.addColorStop(1, 'rgba(74, 40, 14, 0)');
    ctx.fillStyle = wallShadow;
    ctx.fillRect(z.x, floorY, z.w, 18);

    const leftShadow = ctx.createLinearGradient(z.x, 0, z.x + 16, 0);
    leftShadow.addColorStop(0, 'rgba(74, 40, 14, 0.11)');
    leftShadow.addColorStop(1, 'rgba(74, 40, 14, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(z.x, z.y, 16, z.h);

    ctx.restore();

    // Viền tường ngăn 3D của phòng
    ctx.save();
    ctx.strokeStyle = '#6f421d';
    ctx.lineWidth = 2;
    this.roundRectPath(ctx, z.x, z.y, z.w, z.h, 8);
    ctx.stroke();
    ctx.restore();
  }

  drawInteriorDoorways(ctx) {
    // Cửa thông phòng giữa Khu Nhập hàng <-> Kho Kệ hàng (tường dọc x=448..462, y=155..205)
    ctx.fillStyle = '#f5e4c6';
    ctx.fillRect(446, 162, 18, 44);
    ctx.strokeStyle = '#8c5523';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(446, 162); ctx.lineTo(464, 162);
    ctx.moveTo(446, 206); ctx.lineTo(464, 206);
    ctx.stroke();

    // Cửa thông phòng giữa Quầy Đơn hàng <-> Khu Đóng gói
    ctx.fillStyle = '#f5e4c6';
    ctx.fillRect(446, 326, 18, 44);
    ctx.beginPath();
    ctx.moveTo(446, 326); ctx.lineTo(464, 326);
    ctx.moveTo(446, 370); ctx.lineTo(464, 370);
    ctx.stroke();

    // Cửa thông phòng giữa Khu Đóng gói <-> Khu Giao hàng
    ctx.fillStyle = '#dcf2da';
    ctx.fillRect(796, 324, 18, 50);
    ctx.beginPath();
    ctx.moveTo(796, 324); ctx.lineTo(814, 324);
    ctx.moveTo(796, 374); ctx.lineTo(814, 374);
    ctx.stroke();
  }

  drawMidCutawayWall(ctx) {
    // Tường ngăn ngang 3D giữa hàng sau và hàng trước (chừa lối đi mở giữa Kho Kệ hàng -> Khu Đóng gói)
    const wallY = 236;
    const drawSeg = (x1, x2) => {
      ctx.fillStyle = '#fff5e1';
      ctx.fillRect(x1, wallY, x2 - x1, 12);
      ctx.strokeStyle = '#5c3415';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, wallY, x2 - x1, 12);
    };
    drawSeg(104, 594);
    drawSeg(666, 1156);

    // Thảm nối lối đi giữa Kho Kệ hàng <-> Khu Đóng gói
    ctx.fillStyle = '#c8eee5';
    ctx.fillRect(596, wallY - 1, 68, 16);
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(598, wallY + 1, 64, 12);
    ctx.setLineDash([]);
  }

  drawFrontCutawayRim(ctx) {
    // Bờ cắt mở 3D phía dưới cùng của ngôi nhà dollhouse (tạo cảm giác khối mô hình dày)
    ctx.save();
    ctx.fillStyle = '#d7b07c';
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(106, 414);
    ctx.lineTo(1154, 414);
    ctx.lineTo(1154, 424);
    ctx.quadraticCurveTo(1154, 428, 1146, 428);
    ctx.lineTo(114, 428);
    ctx.quadraticCurveTo(106, 428, 106, 424);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ===== 1. KHU NHẬP HÀNG (Cửa cuốn lớn, xe tải đang dỡ hàng, thùng chất đống) =====
  drawReceivingDecor(ctx, game) {
    const z = this.zones[0];

    // Vạch sọc vàng đen an toàn vùng dỡ hàng trên sàn
    ctx.save();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(122, 134, 152, 92);
    ctx.setLineDash([]);
    ctx.restore();

    // Cửa cuốn công nghiệp lớn ở tường trái/sau (roll-up shutter door)
    ctx.save();
    // Khung cửa cuốn
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#3b2214';
    ctx.lineWidth = 2.5;
    this.roundRectPath(ctx, 106, 122, 22, 92, 4);
    ctx.fill();
    ctx.stroke();
    // Hộp cửa cuốn trên tường sau
    ctx.fillStyle = '#94a3b8';
    this.roundRectPath(ctx, 134, 86, 108, 34, 4);
    ctx.fill();
    ctx.stroke();
    // Các nan ngang của cửa cuốn
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    for (let ry = 92; ry <= 114; ry += 5) {
      ctx.beginPath();
      ctx.moveTo(136, ry);
      ctx.lineTo(240, ry);
      ctx.stroke();
    }
    // Trụ bảo vệ vàng-đen hai bên cửa dock
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 1.5;
    ctx.fillRect(128, 122, 8, 20);
    ctx.strokeRect(128, 122, 8, 20);
    ctx.fillRect(128, 202, 8, 20);
    ctx.strokeRect(128, 202, 8, 20);
    ctx.restore();

    // Xe tải đang đỗ dỡ hàng ngay cửa cuốn bên trái (ẩn khi xe giao hàng mới đang chạy vào để không đè nhau)
    if (game.receivingTrucks.length === 0) {
      const bob = Math.sin(this.time * 3.2) * 1.1;
      const dockTruckAsset = game.state.level >= GAME_CONFIG.unlocks.largeTruckLevel ? 'truck-large.png' : 'truck-small.png';
      this.drawGroundShadow(ctx, 88, 198, 52, 18, 0.25);
      this.drawSpriteKeepAspect(ctx, dockTruckAsset, 84, 204 + bob, 94, false);
    }

    // Pallet gỗ + thùng carton chất đống (hiển thị nhiều hơn khi có hàng dự trữ)
    const totalReserve = PRODUCTS.reduce((s, p) => s + game.getReserveCount(p.id), 0);
    const drawPallet = (px, py) => {
      ctx.fillStyle = '#c88c4b';
      ctx.strokeStyle = '#5c3415';
      ctx.lineWidth = 1.5;
      ctx.fillRect(px - 28, py - 8, 56, 12);
      ctx.strokeRect(px - 28, py - 8, 56, 12);
      ctx.fillStyle = '#a36b32';
      ctx.fillRect(px - 26, py + 4, 10, 4);
      ctx.fillRect(px - 5, py + 4, 10, 4);
      ctx.fillRect(px + 16, py + 4, 10, 4);
    };

    drawPallet(312, 166);
    this.drawSpriteKeepAspect(ctx, 'boxes.png', 312, 164, 54);

    drawPallet(396, 166);
    this.drawSpriteKeepAspect(ctx, 'boxes.png', 396, 164, totalReserve > 0 ? 60 : 48);

    // Thêm đống thùng phụ ở góc dưới phải khi có hàng dự trữ hoặc hàng đang về
    if (totalReserve > 5 || game.state.pendingDeliveries.length > 0) {
      this.drawGroundShadow(ctx, 396, 224, 24, 8, 0.18);
      this.drawSpriteKeepAspect(ctx, 'boxes.png', 396, 224, 46);
    }

    // Bảng thông báo chuyến hàng đang đến trên tường sau
    ctx.save();
    ctx.fillStyle = '#fffbeb';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.8;
    this.roundRectPath(ctx, 294, 84, 134, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#78350f';
    ctx.font = '800 11px Nunito, sans-serif';
    ctx.textAlign = 'center';
    const pendCount = game.state.pendingDeliveries.length;
    ctx.fillText(
      pendCount > 0 ? `📦 ${pendCount} chuyến sắp về` : `Dự trữ: ${totalReserve} sp`,
      361, 103
    );
    ctx.restore();
  }

  // ===== 2. KHO KỆ HÀNG (Kệ đầy 6 loại hàng nhiều màu + tủ lạnh) =====
  drawShelvesDecor(ctx, game) {
    const coldUnlocked = game.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;

    // 3 kệ hàng tiêu chuẩn trải dọc tường hậu
    const rackPositions = [516, 600, 684];
    for (const rx of rackPositions) {
      this.drawGroundShadow(ctx, rx, 178, 36, 11, 0.2);
      this.drawSpriteKeepAspect(ctx, 'shelf-rack.png', rx, 180, 74);
    }

    // Tủ lạnh bảo quản hàng đông lạnh bên phải
    this.drawGroundShadow(ctx, 760, 184, 30, 10, 0.2);
    this.drawSpriteKeepAspect(ctx, 'shelf-cold.png', 760, 186, 76, false, coldUnlocked ? 1 : 0.62);

    if (!coldUnlocked) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      this.roundRectPath(ctx, 735, 138, 50, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 10px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒 Lv2', 760, 152);
      ctx.restore();
    }

    // Hiển thị 6 icon sản phẩm thật + thanh số lượng X/12 ngay dưới dãy kệ
    const prodSlots = [
      { id: 'electronics', x: 492, y: 204 },
      { id: 'clothing',    x: 540, y: 204 },
      { id: 'household',   x: 588, y: 204 },
      { id: 'food',        x: 636, y: 204 },
      { id: 'beverage',    x: 684, y: 204 },
      { id: 'frozen',      x: 756, y: 204 }
    ];

    for (const slot of prodSlots) {
      const prod = PRODUCTS.find((p) => p.id === slot.id);
      if (!prod) continue;
      const qty = game.getStockCount(prod.id);
      const ratio = Math.min(1, qty / GAME_CONFIG.shelfCapacity);
      const locked = prod.cold && !coldUnlocked;

      ctx.save();
      // Ô thẻ sản phẩm mini
      ctx.fillStyle = prod.cold ? '#e0f2fe' : '#ffffff';
      ctx.strokeStyle = qty === 0 && !locked ? '#ef4444' : '#0d9488';
      ctx.lineWidth = 1.6;
      this.roundRectPath(ctx, slot.x - 21, slot.y - 22, 42, 42, 8);
      ctx.fill();
      ctx.stroke();

      // Icon sản phẩm
      this.drawSpriteKeepAspect(ctx, prod.iconAsset, slot.x, slot.y + 4, 24, false, locked ? 0.45 : 1);

      // Thanh mức tồn kho X/12
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(slot.x - 16, slot.y + 9, 32, 5);
      ctx.fillStyle = qty <= 2 ? '#ef4444' : qty <= 5 ? '#f59e0b' : '#10b981';
      ctx.fillRect(slot.x - 16, slot.y + 9, 32 * ratio, 5);
      ctx.restore();
    }
  }

  // ===== 3. VĂN PHÒNG (Bàn làm việc, két sắt, bảng số liệu) =====
  drawOfficeDecor(ctx, game) {
    // Thảm tím nhạt giữa phòng
    ctx.save();
    ctx.fillStyle = 'rgba(124, 58, 237, 0.14)';
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.35)';
    ctx.lineWidth = 1.5;
    this.roundRectPath(ctx, 882, 148, 168, 72, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 1. Bảng số liệu KPI treo tường (wall dashboard chart)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#5b21b6';
    ctx.lineWidth = 2;
    this.roundRectPath(ctx, 832, 83, 98, 34, 5);
    ctx.fill();
    ctx.stroke();
    // Biểu đồ cột tăng trưởng
    const bars = [10, 16, 13, 22, 19, 25];
    const barColors = ['#a78bfa', '#8b5cf6', '#60a5fa', '#34d399', '#fbbf24', '#10b981'];
    bars.forEach((bh, idx) => {
      ctx.fillStyle = barColors[idx];
      ctx.fillRect(840 + idx * 14, 112 - bh, 9, bh);
    });
    ctx.restore();

    // Cửa sổ nắng văn phòng
    ctx.save();
    ctx.fillStyle = '#bae6fd';
    ctx.strokeStyle = '#6d28d9';
    ctx.lineWidth = 2;
    this.roundRectPath(ctx, 948, 83, 66, 32, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(981, 84); ctx.lineTo(981, 114);
    ctx.moveTo(949, 99); ctx.lineTo(1013, 99);
    ctx.stroke();
    ctx.restore();

    // 2. Két sắt ngân hàng (3D isometric safe) ở góc phải
    ctx.save();
    this.drawGroundShadow(ctx, 1094, 196, 32, 11, 0.22);
    // Thân két sắt
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    this.roundRectPath(ctx, 1068, 132, 52, 60, 7);
    ctx.fill();
    ctx.stroke();
    // Mặt cửa két
    ctx.fillStyle = '#94a3b8';
    this.roundRectPath(ctx, 1074, 138, 40, 48, 5);
    ctx.fill();
    ctx.stroke();
    // Khóa xoay vàng
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(1096, 162, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tay nắm & đèn xanh
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(1106, 145, 3, 0, Math.PI * 2);
    ctx.fill();
    // Chữ $ trên két
    ctx.fillStyle = '#78350f';
    ctx.font = '900 11px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', 1096, 166);
    ctx.restore();

    // 3. Bàn làm việc gỗ isometric + màn hình máy tính + đèn bàn + ghế xoay
    ctx.save();
    this.drawGroundShadow(ctx, 964, 212, 60, 16, 0.2);
    // Chân bàn
    ctx.fillStyle = '#9a5b25';
    ctx.strokeStyle = '#4a280e';
    ctx.lineWidth = 2;
    ctx.fillRect(916, 182, 12, 28);
    ctx.strokeRect(916, 182, 12, 28);
    ctx.fillRect(1000, 182, 12, 28);
    ctx.strokeRect(1000, 182, 12, 28);
    // Mặt bàn gỗ
    ctx.fillStyle = '#e5a96b';
    this.roundRectPath(ctx, 908, 162, 112, 26, 6);
    ctx.fill();
    ctx.stroke();
    // Màn hình máy tính
    ctx.fillStyle = '#1e293b';
    this.roundRectPath(ctx, 944, 134, 42, 26, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(948, 138, 34, 18);
    // Biểu đồ nhỏ trên màn hình
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(951, 152); ctx.lineTo(959, 146); ctx.lineTo(967, 149); ctx.lineTo(978, 141);
    ctx.stroke();
    // Chân đế màn hình
    ctx.fillStyle = '#475569';
    ctx.fillRect(961, 160, 8, 5);
    // Tập hồ sơ nhân sự trên bàn
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 1.3;
    ctx.fillRect(916, 168, 22, 13);
    ctx.strokeRect(916, 168, 22, 13);
    // Đèn bàn ấm
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(1004, 156, 7, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Chậu cây trang trí góc trái văn phòng
    ctx.save();
    this.drawGroundShadow(ctx, 848, 212, 16, 6, 0.18);
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 1.8;
    this.roundRectPath(ctx, 838, 192, 20, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(848, 184, 12, 0, Math.PI * 2);
    ctx.arc(840, 188, 8, 0, Math.PI * 2);
    ctx.arc(856, 188, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ===== 4. QUẦY ĐƠN HÀNG (Quầy tiếp nhận, thẻ đơn, chuông) =====
  drawOrdersDecor(ctx, game) {
    // 1. Thanh treo thẻ đơn hàng trên tường sau (hiển thị đúng số đơn đang có)
    ctx.save();
    ctx.fillStyle = '#8c5523';
    ctx.fillRect(142, 260, 276, 5);

    const visibleOrders = game.state.orders.slice(0, 6);
    visibleOrders.forEach((o, i) => {
      const tx = 152 + i * 44;
      const sway = Math.sin(this.time * 2.5 + i) * 1.2;
      ctx.save();
      ctx.translate(tx + 16, 264);
      ctx.rotate(sway * 0.02);
      ctx.fillStyle = o.isRush ? '#fed7aa' : '#fef9c3';
      ctx.strokeStyle = o.isRush ? '#c2410c' : '#a16207';
      ctx.lineWidth = 1.6;
      this.roundRectPath(ctx, -16, 0, 32, 22, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a280e';
      ctx.font = '800 10px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${o.id}`, 0, 15);
      ctx.restore();
    });
    ctx.restore();

    // 2. Nhân viên trực quầy dễ thương đứng sau quầy
    this.drawSpriteKeepAspect(ctx, 'worker-warehouse.png', 228, 354, 56);

    // 3. Quầy tiếp nhận gỗ ấm áp với mái viền sọc đỏ-trắng dễ thương
    ctx.save();
    this.drawGroundShadow(ctx, 274, 386, 108, 16, 0.2);
    // Thân quầy gỗ
    ctx.fillStyle = '#f59e6c';
    ctx.strokeStyle = '#5c3415';
    ctx.lineWidth = 2.4;
    this.roundRectPath(ctx, 174, 336, 198, 48, 8);
    ctx.fill();
    ctx.stroke();
    // Mặt quầy kem sáng
    ctx.fillStyle = '#fff5e1';
    this.roundRectPath(ctx, 168, 326, 210, 16, 6);
    ctx.fill();
    ctx.stroke();
    // Mặt trước kẻ ô trang trí
    ctx.fillStyle = '#e11d48';
    this.roundRectPath(ctx, 194, 349, 158, 22, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TIẾP NHẬN ĐƠN HÀNG', 273, 364);
    ctx.restore();

    // 4. Chuông gọi đơn vàng bóng (rung & tỏa vòng sáng khi có đơn mới)
    ctx.save();
    const bellX = 296;
    const bellY = 326;
    const bounce = this.bellPulse > 0 ? Math.abs(Math.sin(this.bellPulse * Math.PI * 3)) * 5 : 0;
    // Đế chuông
    ctx.fillStyle = '#78350f';
    ctx.fillRect(bellX - 14, bellY - 3, 28, 5);
    // Vòm chuông vàng
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(bellX, bellY - 3 - bounce, 12, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Nút bấm đỉnh chuông
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(bellX, bellY - 16 - bounce, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Vòng sóng âm khi chuông reo
    if (this.bellPulse > 0) {
      ctx.strokeStyle = `rgba(245, 158, 11, ${this.bellPulse})`;
      ctx.lineWidth = 2;
      const r = 16 + (1 - this.bellPulse) * 20;
      ctx.beginPath();
      ctx.arc(bellX, bellY - 10, r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();

    // Bảng kẹp giấy (clipboard) trên mặt quầy
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#8c5523';
    ctx.lineWidth = 1.5;
    ctx.fillRect(328, 317, 22, 16);
    ctx.strokeRect(328, 317, 22, 16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(332, 321, 14, 2);
    ctx.fillRect(332, 326, 10, 2);
    ctx.restore();

    // Thảm chào mừng trước quầy
    ctx.save();
    ctx.fillStyle = '#fda4af';
    ctx.strokeStyle = '#be123c';
    ctx.lineWidth = 1.5;
    this.roundRectPath(ctx, 226, 391, 96, 14, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // ===== 5. KHU ĐÓNG GÓI (Bàn đóng gói, thùng carton, băng chuyền) =====
  drawPackingDecor(ctx, game) {
    // 2 Bàn đóng gói (tái sử dụng packing-table.png) + thanh tiến độ trực tiếp khi đang gói
    const tablesPos = [
      { id: 1, x: 676, y: 342 },
      { id: 2, x: 750, y: 388 }
    ];

    // Đống thùng carton nguyên liệu bên góc trái dưới
    this.drawGroundShadow(ctx, 502, 396, 26, 9, 0.2);
    this.drawSpriteKeepAspect(ctx, 'boxes.png', 502, 396, 48);

    for (const tp of tablesPos) {
      const tableState = game.state.packingTables.find((t) => t.id === tp.id);
      this.drawGroundShadow(ctx, tp.x, tp.y + 4, 34, 11, 0.22);
      this.drawSpriteKeepAspect(ctx, 'packing-table.png', tp.x, tp.y + 6, 62);

      if (tableState && tableState.orderId !== null) {
        const pct = Math.min(1, tableState.progress / 100);
        // Thùng đang đóng gói trên bàn
        this.drawSpriteKeepAspect(ctx, 'boxes.png', tp.x, tp.y - 22, 26);

        // Thanh tiến độ xanh nổi ngay trên bàn
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.8;
        this.roundRectPath(ctx, tp.x - 32, tp.y - 68, 64, 15, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2563eb';
        this.roundRectPath(ctx, tp.x - 30, tp.y - 66, Math.max(6, 60 * pct), 11, 5);
        ctx.fill();
        ctx.fillStyle = '#1e3a8a';
        ctx.font = '800 9px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${tableState.orderId} ${Math.floor(pct * 100)}%`, tp.x, tp.y - 72);
        ctx.restore();
      }
    }

    // Kiện hàng đã đóng gói sẵn sàng phối xe (xếp gọn gần cửa sang Khu Giao hàng)
    const packedCount = game.state.orders.filter((o) => o.status === 'packed').length;
    if (packedCount > 0) {
      this.drawGroundShadow(ctx, 772, 326, 20, 7, 0.2);
      this.drawSpriteKeepAspect(ctx, 'boxes.png', 772, 326, 36);
      ctx.save();
      ctx.fillStyle = '#16a34a';
      this.roundRectPath(ctx, 756, 286, 32, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '900 10px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`✓${packedCount}`, 772, 298);
      ctx.restore();
    }
  }

  // ===== 6. KHU GIAO HÀNG (Xe tải, xe máy, bảng tuyến đường) =====
  drawDispatchDecor(ctx, game) {
    // Nửa phải khu là sân bãi nhựa đỗ xe thông thẳng ra đường giao hàng
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.fillRect(942, 290, 206, 120);
    // Vạch ô đỗ xe vàng sáng
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(952, 298, 84, 52);
    ctx.strokeRect(1044, 298, 94, 52);
    ctx.strokeRect(952, 356, 94, 48);
    ctx.setLineDash([]);
    // Mũi tên hướng xuất bến trên mặt đường
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '900 16px sans-serif';
    ctx.fillText('➜', 1106, 388);
    ctx.restore();

    // 1. Bảng tuyến đường (Route board) treo trên tường sau Khu Giao hàng
    ctx.save();
    ctx.fillStyle = '#e0f2c4';
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2;
    this.roundRectPath(ctx, 828, 255, 134, 30, 5);
    ctx.fill();
    ctx.stroke();
    // Đường nối tuyến trên bảng
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(844, 275);
    ctx.quadraticCurveTo(892, 260, 946, 273);
    ctx.stroke();
    // Chấm điểm Khu 1 & Khu 2
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(844, 275, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16a34a';
    ctx.beginPath(); ctx.arc(894, 266, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = game.state.level >= 3 ? '#2563eb' : '#94a3b8';
    ctx.beginPath(); ctx.arc(946, 273, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 2. Các xe đang đậu sẵn trong bãi (xe máy, xe tải nhỏ, xe tải lớn)
    const busyTypes = new Set(game.activeVehicles.map((v) => v.type));
    if (game.state.fleet.bike > 0) {
      const alpha = busyTypes.has('bike') && game.state.fleet.bike <= 1 ? 0.35 : 1;
      this.drawGroundShadow(ctx, 994, 392, 24, 8, 0.25);
      this.drawSpriteKeepAspect(ctx, 'bike-delivery.png', 994, 395, 52, true, alpha);
    }
    if (game.state.fleet.truckSmall > 0) {
      const alpha = busyTypes.has('truckSmall') && game.state.fleet.truckSmall <= 1 ? 0.35 : 1;
      this.drawGroundShadow(ctx, 1088, 344, 36, 12, 0.25);
      this.drawSpriteKeepAspect(ctx, 'truck-small.png', 1088, 348, 66, true, alpha);
    }
    if (game.state.fleet.truckLarge > 0) {
      const alpha = busyTypes.has('truckLarge') && game.state.fleet.truckLarge <= 1 ? 0.35 : 1;
      this.drawGroundShadow(ctx, 994, 340, 38, 12, 0.25);
      this.drawSpriteKeepAspect(ctx, 'truck-large.png', 994, 344, 66, true, alpha);
    }
  }

  // ===== VIỀN SÁNG BẤM ĐƯỢC + HIỆU ỨNG SÓNG KHI CHẠM KHU =====
  drawZoneGlowAndRipple(ctx, z) {
    const isHover = this.hoveredZoneId === z.id;
    const isActive = this.activeZoneId === z.id;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.0 + z.col * 1.1 + z.row * 1.7);

    ctx.save();
    // Viền sáng nhẹ luôn hiển thị để người chơi biết khu nào bấm được
    const baseAlpha = isActive ? 0.95 : isHover ? 0.88 : 0.38 + pulse * 0.16;
    ctx.strokeStyle = z.accent;
    ctx.globalAlpha = baseAlpha;
    ctx.lineWidth = isActive ? 4.2 : isHover ? 3.5 : 2.2;
    if (isHover || isActive) {
      ctx.shadowColor = z.accent;
      ctx.shadowBlur = isActive ? 14 : 10;
    }
    this.roundRectPath(ctx, z.x + 2, z.y + 2, z.w - 4, z.h - 4, 8);
    ctx.stroke();

    // Phủ sáng siêu nhẹ khi rê chuột lên khu
    if (isHover || isActive) {
      ctx.globalAlpha = isActive ? 0.08 : 0.06;
      ctx.fillStyle = z.accent;
      this.roundRectPath(ctx, z.x + 2, z.y + 2, z.w - 4, z.h - 4, 8);
      ctx.fill();
    }
    ctx.restore();

    // Sóng chạm tròn (click ripple)
    if (this.clickRipple && this.clickRipple.zoneId === z.id) {
      const t = this.clickRipple.t;
      ctx.save();
      this.roundRectPath(ctx, z.x, z.y, z.w, z.h, 8);
      ctx.clip();
      ctx.strokeStyle = z.accent;
      ctx.globalAlpha = (1 - t) * 0.65;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.clickRipple.x, this.clickRipple.y, 12 + t * 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ===== NHÃN TÊN 6 KHU DẠNG CHIP RÕ RÀNG =====
  getZoneBadgeText(z, game) {
    switch (z.id) {
      case 'receiving': {
        const pend = game.state.pendingDeliveries.length;
        return pend > 0 ? `${pend} đang về` : 'Nhập hàng';
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
        return busy > 0 ? `Đang gói ${busy}` : `${wait} chờ gói`;
      }
      case 'dispatch': {
        const moving = game.activeVehicles.length;
        const packed = game.state.orders.filter((o) => o.status === 'packed').length;
        return moving > 0 ? `${moving} xe chạy` : packed > 0 ? `${packed} chờ giao` : 'Sẵn sàng';
      }
      default:
        return '';
    }
  }

  drawZoneChip(ctx, z, game) {
    const isHover = this.hoveredZoneId === z.id;
    const isActive = this.activeZoneId === z.id;
    const liftY = isHover || isActive ? -2.5 : 0;

    const title = `${z.icon} ${z.name}`;
    const badge = this.getZoneBadgeText(z, game);

    ctx.save();
    ctx.font = '900 13.5px Nunito, Quicksand, sans-serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '800 11.5px Nunito, Quicksand, sans-serif';
    const badgeW = badge ? ctx.measureText(badge).width + 14 : 0;

    const padX = 11;
    const gap = badge ? 8 : 0;
    const chipW = Math.min(z.w - 16, padX * 2 + titleW + gap + badgeW);
    const chipH = 26;
    const cx = z.x + z.w / 2;
    // Đặt chip nằm gọn trên sống tường ngăn trên của mỗi khu -> không che bảng số liệu, cửa cuốn hay thẻ đơn!
    const cy = (z.row === 0 ? z.y - 16 : z.y - 15) + liftY;

    // Bóng đổ chip
    ctx.fillStyle = 'rgba(74, 40, 14, 0.24)';
    this.roundRectPath(ctx, cx - chipW / 2, cy + 2.5, chipW, chipH, 14);
    ctx.fill();

    // Nền chip sáng rõ
    ctx.fillStyle = isActive ? z.accent : z.chipBg;
    ctx.strokeStyle = isActive ? '#ffffff' : z.accent;
    ctx.lineWidth = 2.4;
    this.roundRectPath(ctx, cx - chipW / 2, cy, chipW, chipH, 14);
    ctx.fill();
    ctx.stroke();

    // Tên khu
    ctx.fillStyle = isActive ? '#ffffff' : '#3a1f0b';
    ctx.font = '900 13.5px Nunito, Quicksand, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textStartX = cx - chipW / 2 + padX;
    ctx.fillText(title, textStartX, cy + chipH / 2 + 0.5);

    // Nhãn trạng thái nhỏ bên phải chip
    if (badge) {
      const bx = textStartX + titleW + gap;
      const by = cy + 4;
      const bh = chipH - 8;
      ctx.fillStyle = isActive ? 'rgba(255,255,255,0.22)' : z.chipBadgeBg;
      this.roundRectPath(ctx, bx, by, badgeW, bh, 10);
      ctx.fill();

      ctx.fillStyle = isActive ? '#ffffff' : z.chipBadgeColor;
      ctx.font = '800 11.5px Nunito, Quicksand, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(badge, bx + badgeW / 2, cy + chipH / 2 + 0.5);
    }

    ctx.restore();
  }

  drawFloatingTexts(ctx) {
    for (const ft of this.floatingTexts) {
      const alpha = 1 - Math.pow(ft.life / ft.maxLife, 1.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = '900 15px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

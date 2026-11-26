/**
 * Logistic Center — Phase 1 (v1.0)
 * Giao diện Cute 3D Cartoon Isometric Dollhouse theo ảnh mẫu đã duyệt.
 * Giữ nguyên toàn bộ bản sửa lỗi fix1 + toàn bộ luật chơi Phase 1.
 */
class LogisticCenterGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.miniMapCanvas = document.getElementById('mini-map-canvas');
    this.miniMapCtx = this.miniMapCanvas.getContext('2d');
    this.routeMapCanvas = document.getElementById('route-map-canvas');
    this.routeMapCtx = this.routeMapCanvas.getContext('2d');

    this.assets = new AssetManager();
    this.state = this.createInitialState();
    this.selectedOrderId = null;
    this.selectedPackedIds = new Set();
    this.selectedVehicleType = 'bike';
    this.selectedZoneId = 'zone1';

    this.paused = false;
    this.speedMultiplier = 1;
    this.bankrupt = false;
    this.summaryOpen = false;
    this.orderSpawnTimer = 0;
    this.uiTickTimer = 0;
    this.lastTime = 0;

    // Thực thể hoạt hình trong kho isometric (giữ nguyên hệ thống entities.js)
    this.conveyor = new AnimatedEntity({
      x: 410, y: 270, width: 210, height: 210,
      frames: ASSET_MANIFEST.animations.conveyor,
      fps: 6, label: 'Băng chuyền', fallbackAsset: 'conveyor.png'
    });
    this.forklift = new ForkliftEntity(490, 330);
    this.workers = [];
    this.drivers = [];
    this.activeVehicles = [];

    this.bindUI();
    this.registerPWA();
  }

  createInitialState() {
    return {
      version: VERSION,
      day: 1,
      dayElapsed: 0,
      speedMultiplier: 1,
      money: GAME_CONFIG.startingMoney, // $2,000
      reputation: GAME_CONFIG.startingReputation, // 50 (0..100)
      level: 1,
      xp: 0,
      nextOrderId: 1,
      inventory: {
        electronics: [{ qty: 6, daysLeft: null }],
        clothing: [{ qty: 6, daysLeft: null }],
        household: [{ qty: 6, daysLeft: null }],
        food: [{ qty: 5, daysLeft: 3 }],
        beverage: [{ qty: 6, daysLeft: 5 }],
        frozen: []
      },
      supplies: { box: 12, tape: 12, coldBag: 4 },
      pendingDeliveries: [],
      packingTables: [
        { id: 1, orderId: null, progress: 0 },
        { id: 2, orderId: null, progress: 0 }
      ],
      fleet: { bike: 1, truckSmall: 1, truckLarge: 0 },
      staff: { workers: 1, drivers: 1 },
      orders: [],
      dayStats: {
        revenue: 0,
        purchaseCost: 0,
        fuelCost: 0,
        deliveredCount: 0,
        failedCount: 0,
        expiredItems: 0,
        ratings: []
      }
    };
  }

  init() {
    document.getElementById('app-version').textContent = `v${VERSION}`;
    this.loadGame();
    this.speedMultiplier = this.state.speedMultiplier || 1;
    document.getElementById('btn-speed').textContent = `⏩ ${this.speedMultiplier}x`;
    this.syncVisualStaff();
    this.renderAssetModal();
    this.renderAllUI();
    this.log(`Chào mừng đến với Logistic Center v${VERSION}!`);
    if (this.state.orders.length === 0) {
      this.spawnOrder();
      this.spawnOrder();
    }

    // Hiện thông báo đang tải asset (không hiện khung xám trống) và chạy vòng lặp ngay lập tức
    const loadingEl = document.getElementById('loading-overlay');
    if (this.assets.isLoadingAny()) loadingEl.classList.remove('hidden');

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));

    this.assets.loadAll(() => {
      this.renderAssetModal();
      if (!this.assets.isLoadingAny()) {
        loadingEl.classList.add('hidden');
        this.renderAllUI();
      }
    });
  }

  registerPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ===== LƯU / TẢI LOCALSTORAGE ("logistic-center-v1") =====
  saveGame(reason = '') {
    if (this.bankrupt) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      if (reason) this.log(`💾 Đã tự lưu game (${reason}).`);
    } catch (e) {
      console.warn('Lưu localStorage thất bại:', e);
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.money === 'number' && typeof parsed.day === 'number') {
        this.state = { ...this.createInitialState(), ...parsed };
        this.log(`📂 Đã tải dữ liệu lưu (Ngày ${this.state.day}, $${this.state.money}).`);
      }
    } catch (e) {
      console.warn('Tải save lỗi, dùng trạng thái mới:', e);
    }
  }

  resetGame() {
    localStorage.removeItem(SAVE_KEY);
    this.state = this.createInitialState();
    this.selectedOrderId = null;
    this.selectedPackedIds.clear();
    this.activeVehicles = [];
    this.bankrupt = false;
    this.summaryOpen = false;
    this.paused = false;
    this.speedMultiplier = 1;
    document.getElementById('btn-speed').textContent = '⏩ 1x';
    document.getElementById('btn-pause').textContent = '⏸';
    document.getElementById('bankrupt-modal').classList.add('hidden');
    document.getElementById('summary-modal').classList.add('hidden');
    this.syncVisualStaff();
    this.spawnOrder();
    this.spawnOrder();
    this.renderAllUI();
    this.log('🔄 Đã khởi tạo lại game mới ($2,000).');
  }

  syncVisualStaff() {
    this.workers = [];
    for (let i = 0; i < this.state.staff.workers; i++) {
      this.workers.push(new WorkerEntity(270 + i * 38, 230 + (i % 2) * 35));
    }
    this.drivers = [];
    for (let i = 0; i < this.state.staff.drivers; i++) {
      this.drivers.push(new DriverEntity(610 + i * 36, 330 + (i % 2) * 20));
    }
  }

  // ===== SỰ KIỆN UI =====
  bindUI() {
    const switchTab = (tabId) => {
      document.querySelectorAll('.gtab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-content').forEach((p) => p.classList.toggle('active', p.id === tabId));
      this.renderAllUI();
    };

    document.querySelectorAll('.gtab').forEach((btn) => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    document.getElementById('dock-minimap-box').onclick = () => switchTab('tab-dispatch');

    document.getElementById('btn-pause').onclick = () => {
      this.paused = !this.paused;
      document.getElementById('btn-pause').textContent = this.paused ? '▶' : '⏸';
      if (this.paused) this.saveGame('tạm dừng');
    };

    document.getElementById('btn-speed').onclick = () => {
      this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
      this.state.speedMultiplier = this.speedMultiplier;
      document.getElementById('btn-speed').textContent = `⏩ ${this.speedMultiplier}x`;
      this.saveGame();
    };

    document.getElementById('btn-end-day').onclick = () => {
      if (!this.summaryOpen && !this.bankrupt) this.openDaySummary();
    };

    document.getElementById('btn-assets').onclick = () => {
      document.getElementById('asset-modal').classList.remove('hidden');
    };
    document.getElementById('btn-close-asset').onclick = () => {
      document.getElementById('asset-modal').classList.add('hidden');
    };

    document.getElementById('btn-toggle-log').onclick = () => {
      document.getElementById('log-drawer').classList.toggle('hidden');
    };
    document.getElementById('btn-close-log').onclick = () => {
      document.getElementById('log-drawer').classList.add('hidden');
    };

    document.getElementById('btn-reset').onclick = () => {
      if (confirm('Bạn có chắc muốn chơi lại từ đầu?')) this.resetGame();
    };

    document.getElementById('btn-new-order').onclick = () => this.spawnOrder();
    document.getElementById('btn-dispatch-go').onclick = () => this.dispatchSelectedOrders();
    document.getElementById('btn-next-day').onclick = () => this.startNextDay();
    document.getElementById('btn-restart-bankrupt').onclick = () => this.resetGame();

    window.addEventListener('beforeunload', () => this.saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveGame();
    });
  }

  // ===== KHO & HẠN SỬ DỤNG =====
  getStockCount(productId) {
    return (this.state.inventory[productId] || []).reduce((s, b) => s + b.qty, 0);
  }

  getMinShelfLife(productId) {
    const batches = (this.state.inventory[productId] || []).filter((b) => b.qty > 0 && b.daysLeft !== null);
    if (batches.length === 0) return null;
    return Math.min(...batches.map((b) => b.daysLeft));
  }

  consumeStock(productId, qty = 1) {
    const batches = this.state.inventory[productId] || [];
    batches.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
    let remain = qty;
    for (const batch of batches) {
      if (remain <= 0) break;
      const take = Math.min(batch.qty, remain);
      batch.qty -= take;
      remain -= take;
    }
    this.state.inventory[productId] = batches.filter((b) => b.qty > 0);
    return remain === 0;
  }

  // ===== ĐƠN HÀNG (130s THƯỜNG / 75s GẤP) =====
  spawnOrder() {
    if (this.state.orders.length >= 8) return;
    const coldUnlocked = this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;
    const zone2Unlocked = this.state.level >= GAME_CONFIG.unlocks.zone2AndRushLevel;

    const availableProducts = PRODUCTS.filter((p) => !p.cold || coldUnlocked);
    const isRush = zone2Unlocked && Math.random() < 0.35;
    const zone = zone2Unlocked && Math.random() < 0.45 ? 'zone2' : 'zone1';

    const itemCount = Math.min(3, 1 + Math.floor(Math.random() * (this.state.level >= 3 ? 3 : 2)));
    const items = [];
    let reward = 0;
    let needsCold = false;

    for (let i = 0; i < itemCount; i++) {
      const prod = availableProducts[Math.floor(Math.random() * availableProducts.length)];
      const existing = items.find((it) => it.productId === prod.id);
      if (existing) {
        existing.qty += 1;
      } else {
        items.push({ productId: prod.id, qty: 1, picked: 0 });
      }
      reward += prod.sellPrice;
      if (prod.cold) needsCold = true;
    }

    if (isRush) reward = Math.round(reward * 1.35);
    const zoneCfg = ZONES.find((z) => z.id === zone);
    reward += zoneCfg.bonus;

    const timeLimit = isRush ? 75 : 130;
    const order = {
      id: this.state.nextOrderId++,
      isRush,
      zone,
      items,
      needsCold,
      reward,
      xp: isRush ? 40 : 25,
      timeLimit,
      timeLeft: timeLimit,
      status: 'picking'
    };

    this.state.orders.push(order);
    if (!this.selectedOrderId) this.selectedOrderId = order.id;
    this.log(`📩 Đơn #${order.id} (${isRush ? 'GẤP' : 'Thường'} — ${zoneCfg.name}) vừa đến.`);
    this.renderAllUI();
  }

  // ===== SOẠN HÀNG =====
  pickFromShelf(productId) {
    const order = this.state.orders.find((o) => o.id === this.selectedOrderId && o.status === 'picking');
    if (!order) {
      this.log('⚠️ Hãy chọn một thẻ đơn hàng đang chờ soạn phía trên trước.');
      return;
    }
    const item = order.items.find((it) => it.productId === productId && it.picked < it.qty);
    if (!item) {
      this.log('❌ Món này không nằm trong danh sách cần soạn của đơn đang chọn!');
      return;
    }
    if (this.getStockCount(productId) <= 0) {
      this.log('⚠️ Hết hàng trên kệ! Đặt thêm ở tab Nhà cung cấp.');
      return;
    }

    this.consumeStock(productId, 1);
    item.picked += 1;

    const done = order.items.every((it) => it.picked >= it.qty);
    if (done) {
      order.status = 'ready_to_pack';
      this.log(`✅ Đơn #${order.id} đã soạn đủ hàng! Chuyển sang tab Đóng gói.`);
    }
    this.renderAllUI();
  }

  // ===== ĐÓNG GÓI =====
  assignToPackingTable(tableId) {
    const table = this.state.packingTables.find((t) => t.id === tableId);
    if (!table || table.orderId !== null) return;

    const order = this.state.orders.find((o) => o.status === 'ready_to_pack');
    if (!order) {
      this.log('⚠️ Chưa có đơn nào soạn xong để đưa lên bàn đóng gói.');
      return;
    }
    if (this.state.supplies.box < 1 || this.state.supplies.tape < 1) {
      this.log('⚠️ Thiếu thùng carton hoặc băng dính! Mua thêm ở tab Nhà cung cấp.');
      return;
    }
    if (order.needsCold && this.state.supplies.coldBag < 1) {
      this.log('⚠️ Đơn đông lạnh cần 1 túi giữ lạnh! Mua thêm ở tab Nhà cung cấp.');
      return;
    }

    this.state.supplies.box -= 1;
    this.state.supplies.tape -= 1;
    if (order.needsCold) this.state.supplies.coldBag -= 1;

    order.status = 'packing';
    table.orderId = order.id;
    table.progress = 0;
    this.log(`📦 Bàn #${table.id} bắt đầu đóng gói Đơn #${order.id}.`);
    this.renderAllUI();
  }

  // ===== NHÀ CUNG CẤP =====
  buyProductFromSupplier(productId, qty = 5) {
    const prod = PRODUCTS.find((p) => p.id === productId);
    if (!prod) return;
    if (prod.cold && this.state.level < GAME_CONFIG.unlocks.coldShelfLevel) {
      this.log(`🔒 Cần đạt Cấp ${GAME_CONFIG.unlocks.coldShelfLevel} để mở khóa Kệ lạnh.`);
      return;
    }
    const cost = prod.buyPrice * qty;
    if (this.state.money < cost) {
      this.log(`💸 Không đủ tiền đặt ${qty} ${prod.name} (cần $${cost}).`);
      return;
    }
    this.state.money -= cost;
    this.state.dayStats.purchaseCost += cost;
    this.state.pendingDeliveries.push({ productId, qty });
    this.log(`🛒 Đã đặt ${qty} ${prod.name} (-$${cost}). Hàng về sáng mai.`);
    this.renderAllUI();
  }

  buySupply(supplyId, qty = 5) {
    const sup = SUPPLIES[supplyId];
    const cost = sup.price * qty;
    if (this.state.money < cost) {
      this.log(`💸 Không đủ tiền mua ${sup.name} (cần $${cost}).`);
      return;
    }
    this.state.money -= cost;
    this.state.dayStats.purchaseCost += cost;
    this.state.supplies[supplyId] += qty;
    this.log(`🛒 Đã mua ${qty} ${sup.name} (-$${cost}).`);
    this.renderAllUI();
  }

  // ===== PHỐI XE & BẢN ĐỒ =====
  dispatchSelectedOrders() {
    const vehCfg = VEHICLE_TYPES[this.selectedVehicleType];
    if (this.state.fleet[this.selectedVehicleType] <= 0) {
      this.log(`⚠️ Bạn chưa sở hữu ${vehCfg.name}. Mua ở tab Nhân sự & Xe.`);
      return;
    }
    const zoneCfg = ZONES.find((z) => z.id === this.selectedZoneId);
    if (this.state.level < zoneCfg.unlockLevel) {
      this.log(`🔒 ${zoneCfg.name} mở khóa ở Cấp ${zoneCfg.unlockLevel}.`);
      return;
    }

    const pickedOrders = this.state.orders.filter(
      (o) => o.status === 'packed' && this.selectedPackedIds.has(o.id)
    );
    if (pickedOrders.length === 0) {
      this.log('⚠️ Hãy chọn ít nhất 1 đơn đã đóng gói để chất lên xe.');
      return;
    }
    if (pickedOrders.length > vehCfg.capacity) {
      this.log(`⚠️ ${vehCfg.name} chỉ chở tối đa ${vehCfg.capacity} đơn!`);
      return;
    }

    const fuelCost = Math.round(vehCfg.fuelCost * zoneCfg.distanceMult);
    if (this.state.money < fuelCost) {
      this.log(`⛽ Không đủ tiền xăng ($${fuelCost}) để xuất bến!`);
      return;
    }

    this.state.money -= fuelCost;
    this.state.dayStats.fuelCost += fuelCost;

    pickedOrders.forEach((o) => {
      o.status = 'delivering';
      this.selectedPackedIds.delete(o.id);
    });

    const vehEntity = new VehicleEntity({
      type: this.selectedVehicleType,
      x: 860,
      y: 235 + Math.random() * 45,
      orders: pickedOrders,
      zone: zoneCfg,
      onComplete: (v) => this.completeVehicleDelivery(v)
    });
    this.activeVehicles.push(vehEntity);
    this.log(`🚀 ${vehCfg.name} xuất bến giao ${pickedOrders.length} đơn tới ${zoneCfg.name} (xăng -$${fuelCost}).`);
    this.renderAllUI();
  }

  completeVehicleDelivery(vehEntity) {
    let totalEarned = 0;
    let totalXp = 0;
    const starsList = [];

    vehEntity.orders.forEach((order) => {
      const ratio = order.timeLeft / order.timeLimit;
      let stars = 5;
      if (ratio < 0.15) stars = 2;
      else if (ratio < 0.35) stars = 3;
      else if (ratio < 0.6) stars = 4;

      starsList.push(stars);
      totalEarned += order.reward;
      totalXp += order.xp;

      const repDelta = stars >= 5 ? 3 : stars === 4 ? 1 : stars === 3 ? 0 : -4;
      this.adjustReputation(repDelta);

      this.state.dayStats.deliveredCount += 1;
      this.state.dayStats.ratings.push(stars);
      this.state.orders = this.state.orders.filter((o) => o.id !== order.id);
      if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    });

    this.state.money += totalEarned;
    this.state.dayStats.revenue += totalEarned;
    this.addXP(totalXp);

    const avgStar = (starsList.reduce((a, b) => a + b, 0) / starsList.length).toFixed(1);
    this.log(`⭐ Giao xong ${vehEntity.orders.length} đơn (+$${totalEarned}, +${totalXp} XP, ${avgStar}★).`);
    this.renderAllUI();
  }

  adjustReputation(delta) {
    this.state.reputation = Math.max(
      GAME_CONFIG.minReputation,
      Math.min(GAME_CONFIG.maxReputation, this.state.reputation + delta)
    );
  }

  addXP(amount) {
    this.state.xp += amount;
    while (this.state.xp >= GAME_CONFIG.xpPerLevel(this.state.level)) {
      this.state.xp -= GAME_CONFIG.xpPerLevel(this.state.level);
      this.state.level += 1;
      this.log(`🎉 LÊN CẤP ${this.state.level}!`);
      if (this.state.level === GAME_CONFIG.unlocks.coldShelfLevel) {
        this.log('❄️ Đã mở khóa KỆ LẠNH & hàng Đông lạnh!');
      }
      if (this.state.level === GAME_CONFIG.unlocks.zone2AndRushLevel) {
        this.log('🏙️ Đã mở khóa KHU 2 & ĐƠN GẤP!');
      }
      if (this.state.level === GAME_CONFIG.unlocks.largeTruckLevel) {
        this.log('🚛 Đã mở khóa XE TẢI LỚN (6 đơn/chuyến)!');
      }
    }
  }

  // ===== NHÂN SỰ & XE =====
  hireStaff(role) {
    const cost = role === 'workers' ? GAME_CONFIG.staff.workerHireCost : GAME_CONFIG.staff.driverHireCost;
    if (this.state.money < cost) {
      this.log(`💸 Không đủ tiền tuyển (cần $${cost}).`);
      return;
    }
    this.state.money -= cost;
    this.state.staff[role] += 1;
    this.syncVisualStaff();
    this.log(`👤 Đã tuyển thêm 1 ${role === 'workers' ? 'Nhân viên kho' : 'Tài xế'} (-$${cost}).`);
    this.renderAllUI();
  }

  buyVehicle(type) {
    const cfg = VEHICLE_TYPES[type];
    if (this.state.level < cfg.unlockLevel) {
      this.log(`🔒 ${cfg.name} mở khóa ở Cấp ${cfg.unlockLevel}.`);
      return;
    }
    if (this.state.money < cfg.buyCost) {
      this.log(`💸 Không đủ tiền mua ${cfg.name} (cần $${cfg.buyCost}).`);
      return;
    }
    this.state.money -= cfg.buyCost;
    this.state.fleet[type] += 1;
    this.log(`🚗 Đã mua thêm 1 ${cfg.name} (-$${cfg.buyCost}).`);
    this.renderAllUI();
  }

  // ===== TỔNG KẾT NGÀY & PHÁ SẢN =====
  openDaySummary() {
    this.summaryOpen = true;
    const totalVehicles = this.state.fleet.bike + this.state.fleet.truckSmall + this.state.fleet.truckLarge;
    const rent = GAME_CONFIG.fixedCosts.rent;
    const utilities = GAME_CONFIG.fixedCosts.utilities;
    const insurance = totalVehicles * GAME_CONFIG.fixedCosts.insurancePerVehicle;
    const fixedTotal = rent + utilities + insurance;

    const wages =
      this.state.staff.workers * GAME_CONFIG.staff.workerDailyWage +
      this.state.staff.drivers * GAME_CONFIG.staff.driverDailyWage;

    let expiredCount = 0;
    for (const prod of PRODUCTS) {
      if (prod.shelfLife !== null) {
        const nextBatches = [];
        for (const batch of this.state.inventory[prod.id]) {
          batch.daysLeft -= 1;
          if (batch.daysLeft <= 0) {
            expiredCount += batch.qty;
          } else {
            nextBatches.push(batch);
          }
        }
        this.state.inventory[prod.id] = nextBatches;
      }
    }
    this.state.dayStats.expiredItems = expiredCount;

    const totalDue = fixedTotal + wages;
    if (this.state.money < fixedTotal) {
      this.bankrupt = true;
      localStorage.removeItem(SAVE_KEY);
      document.getElementById('bankrupt-body').innerHTML = `
        <p>Cuối Ngày ${this.state.day}, bạn chỉ còn <strong>$${this.state.money}</strong> nhưng chi phí cố định bắt buộc là <strong>$${fixedTotal}</strong> (Thuê kho $${rent} + Điện nước $${utilities} + Bảo hiểm $${insurance}).</p>
        <p>Trung tâm không thể thanh toán chi phí cố định và đã phá sản.</p>
      `;
      document.getElementById('bankrupt-modal').classList.remove('hidden');
      return;
    }

    this.state.money -= totalDue;
    if (this.state.money < 0) this.state.money = 0;

    const avgStar = this.state.dayStats.ratings.length
      ? (this.state.dayStats.ratings.reduce((a, b) => a + b, 0) / this.state.dayStats.ratings.length).toFixed(1) + '★'
      : '—';

    document.getElementById('sum-day').textContent = this.state.day;
    document.getElementById('summary-body').innerHTML = `
      <div class="sum-row"><span>Đơn giao thành công / Thất bại</span><strong>${this.state.dayStats.deliveredCount} / ${this.state.dayStats.failedCount}</strong></div>
      <div class="sum-row"><span>Đánh giá trung bình</span><strong>${avgStar}</strong></div>
      <div class="sum-row"><span>Doanh thu giao hàng</span><strong style="color:#15803d">+$${this.state.dayStats.revenue}</strong></div>
      <div class="sum-row"><span>Tiền nhập hàng & vật tư</span><span>-$${this.state.dayStats.purchaseCost}</span></div>
      <div class="sum-row"><span>Tiền xăng vận chuyển</span><span>-$${this.state.dayStats.fuelCost}</span></div>
      <div class="sum-row"><span>Lương nhân viên (${this.state.staff.workers} kho, ${this.state.staff.drivers} tài xế)</span><span>-$${wages}</span></div>
      <div class="sum-row"><span>Thuê kho ($50) + Điện nước ($20) + Bảo hiểm (${totalVehicles} xe × $10)</span><strong style="color:#c2410c">-$${fixedTotal}</strong></div>
      <div class="sum-row"><span>Hàng hết hạn bị hủy</span><strong>${expiredCount} sp</strong></div>
      <div class="sum-row"><span>Số dư còn lại</span><strong style="color:#0f766e">$${this.state.money}</strong></div>
    `;
    document.getElementById('summary-modal').classList.remove('hidden');
    this.saveGame(`tổng kết Ngày ${this.state.day}`);
  }

  startNextDay() {
    this.state.day += 1;
    this.state.dayElapsed = 0;
    this.state.dayStats = {
      revenue: 0, purchaseCost: 0, fuelCost: 0,
      deliveredCount: 0, failedCount: 0, expiredItems: 0, ratings: []
    };

    if (this.state.pendingDeliveries.length > 0) {
      let totalIn = 0;
      for (const del of this.state.pendingDeliveries) {
        const prod = PRODUCTS.find((p) => p.id === del.productId);
        this.state.inventory[del.productId].push({ qty: del.qty, daysLeft: prod.shelfLife });
        totalIn += del.qty;
      }
      this.state.pendingDeliveries = [];
      this.log(`🌅 Sáng Ngày ${this.state.day}: Nhà cung cấp đã giao ${totalIn} sản phẩm lên kệ.`);
    }

    this.summaryOpen = false;
    document.getElementById('summary-modal').classList.add('hidden');
    this.spawnOrder();
    this.saveGame(`bắt đầu Ngày ${this.state.day}`);
    this.renderAllUI();
  }

  // ===== CẬP NHẬT VÒNG LẶP GAME (GIỮ NGUYÊN CÂN BẰNG FIX1) =====
  updateLogic(dt) {
    if (this.paused || this.summaryOpen || this.bankrupt) return;

    this.state.dayElapsed += dt;
    if (this.state.dayElapsed >= GAME_CONFIG.dayDurationSec) {
      this.openDaySummary();
      return;
    }

    const maxActiveOrders = this.state.level <= 2 ? 3 : this.state.level <= 4 ? 4 : 5;
    this.orderSpawnTimer += dt;
    if (this.orderSpawnTimer >= 24) {
      this.orderSpawnTimer = 0;
      if (this.state.orders.length < maxActiveOrders) this.spawnOrder();
    }

    let uiDirty = false;
    const expiredPenalty = this.state.level <= 2 ? 3 : 4;
    for (const order of [...this.state.orders]) {
      if (order.status === 'delivering') continue;
      order.timeLeft -= dt;
      if (order.timeLeft <= 0) {
        this.state.orders = this.state.orders.filter((o) => o.id !== order.id);
        if (this.selectedOrderId === order.id) this.selectedOrderId = null;
        this.state.packingTables.forEach((t) => {
          if (t.orderId === order.id) { t.orderId = null; t.progress = 0; }
        });
        this.state.dayStats.failedCount += 1;
        this.adjustReputation(-expiredPenalty);
        this.log(`⏰ Đơn #${order.id} hết giờ! (-${expiredPenalty} Danh tiếng)`);
        uiDirty = true;
      }
    }

    this.uiTickTimer += dt;
    if (this.uiTickTimer >= 0.25) {
      this.uiTickTimer = 0;
      uiDirty = true;
    }

    const packSpeed = 28 + this.state.staff.workers * 8;
    for (const table of this.state.packingTables) {
      if (table.orderId !== null) {
        table.progress += packSpeed * dt;
        if (table.progress >= 100) {
          const order = this.state.orders.find((o) => o.id === table.orderId);
          if (order) {
            order.status = 'packed';
            this.log(`✅ Bàn #${table.id} đóng gói xong Đơn #${order.id}. Sẵn sàng phối xe!`);
          }
          table.orderId = null;
          table.progress = 0;
          uiDirty = true;
        }
      }
    }

    this.conveyor.update(dt);
    this.forklift.update(dt);
    this.workers.forEach((w) => w.update(dt));
    this.drivers.forEach((d) => d.update(dt));
    this.activeVehicles.forEach((v) => v.update(dt));
    this.activeVehicles = this.activeVehicles.filter((v) => !v.done);

    this.updateClockHUD();
    if (uiDirty) this.renderAllUI();
  }

  // ===== VẼ CẢNH KHO ISOMETRIC DOLLHOUSE SÁNG ẤM (ĐÚNG ẢNH MẪU) =====
  drawScene() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const progress = this.state.dayElapsed / GAME_CONFIG.dayDurationSec;

    // 1. Nền kem nắng ấm bên ngoài kho
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#fbe9c9');
    bgGrad.addColorStop(1, '#f3d8ab');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Đường nhựa giao hàng bên phải ngoài cửa kho
    ctx.save();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.moveTo(640, 30);
    ctx.lineTo(960, 175);
    ctx.lineTo(960, 390);
    ctx.lineTo(540, 200);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 16]);
    ctx.beginPath();
    ctx.moveTo(660, 105);
    ctx.lineTo(950, 240);
    ctx.stroke();
    ctx.restore();

    // 3. Sàn gạch isometric dollhouse bên trong kho
    ctx.save();
    ctx.fillStyle = '#fff5e4';
    ctx.strokeStyle = '#9c6635';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(390, 55);
    ctx.lineTo(805, 240);
    ctx.lineTo(510, 445);
    ctx.lineTo(95, 255);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lưới gạch lát sàn nhẹ
    ctx.clip();
    ctx.strokeStyle = 'rgba(180, 130, 80, 0.22)';
    ctx.lineWidth = 1.2;
    for (let i = -8; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(95 + i * 52, 55);
      ctx.lineTo(95 + i * 52 + 360, 445);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(95 + i * 52, 445);
      ctx.lineTo(95 + i * 52 + 360, 55);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Tường sau nhà kho + cửa cuốn xuất hàng mở
    ctx.save();
    ctx.fillStyle = '#f3dfc1';
    ctx.strokeStyle = '#9c6635';
    ctx.lineWidth = 3;
    // Tường trái sau
    ctx.beginPath();
    ctx.moveTo(95, 255);
    ctx.lineTo(95, 145);
    ctx.lineTo(390, 15);
    ctx.lineTo(390, 55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tường phải sau + khung cửa xuất hàng
    ctx.beginPath();
    ctx.moveTo(390, 55);
    ctx.lineTo(390, 15);
    ctx.lineTo(805, 195);
    ctx.lineTo(805, 240);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cửa cuốn bốc hàng màu xám ấm
    ctx.fillStyle = '#6b7280';
    ctx.beginPath();
    ctx.moveTo(575, 135);
    ctx.lineTo(725, 200);
    ctx.lineTo(725, 132);
    ctx.lineTo(575, 67);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Hàm vẽ asset thật kèm bóng đổ mềm
    const drawProp = (file, x, y, sz, fallbackLabel) => {
      ctx.save();
      ctx.fillStyle = 'rgba(92, 64, 38, 0.16)';
      ctx.beginPath();
      ctx.ellipse(x, y + sz * 0.34, sz * 0.36, sz * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const img = this.assets.get(file);
      if (img) {
        ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz);
      } else {
        ctx.save();
        ctx.fillStyle = '#fff8eb';
        ctx.strokeStyle = '#c88a4b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - 34, y - 18, 68, 36, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#6b4226';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fallbackLabel, x, y + 4);
        ctx.restore();
      }
    };

    // 5. Các thiết bị kho bằng asset thật (kệ hàng, tủ lạnh, bàn đóng gói, thùng hàng, xe tải đậu cửa xuất)
    drawProp('shelf-rack.png', 200, 185, 128, 'Kệ hàng');
    drawProp('shelf-rack.png', 485, 125, 122, 'Kệ hàng');
    if (this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel) {
      drawProp('shelf-cold.png', 330, 130, 128, 'Kệ lạnh');
    } else {
      drawProp('shelf-cold.png', 330, 130, 118, 'Kệ lạnh (Lv2)');
    }

    // Xe tải đậu tại cửa xuất hàng bên phải
    drawProp('truck-small.png', 795, 165, 155, 'Xe tải');

    // 2 Bàn đóng gói + thùng hàng trên bàn
    drawProp('packing-table.png', 560, 355, 116, 'Bàn đóng gói 1');
    if (this.state.packingTables[0].orderId !== null) {
      drawProp('boxes.png', 560, 330, 56, 'Thùng');
    }
    drawProp('packing-table.png', 675, 295, 116, 'Bàn đóng gói 2');
    if (this.state.packingTables[1].orderId !== null) {
      drawProp('boxes.png', 675, 270, 56, 'Thùng');
    }

    // 6. Các thực thể chuyển động sắp xếp chiều sâu Y-sorting (băng chuyền, xe nâng, nhân viên, tài xế, xe giao hàng)
    const drawList = [
      this.conveyor,
      ...this.workers,
      this.forklift,
      ...this.drivers,
      ...this.activeVehicles
    ].sort((a, b) => a.y - b.y);
    drawList.forEach((e) => e.draw(ctx, this.assets));

    // 7. Vệt nắng ấm & chu kỳ ngày/hoàng hôn/tối
    let tint = 'rgba(255, 232, 175, 0.08)';
    let badge = '☀️ Nắng sáng';
    if (progress > 0.78) {
      tint = 'rgba(30, 41, 75, 0.34)';
      badge = '🌙 Buổi tối';
    } else if (progress > 0.58) {
      tint = 'rgba(244, 122, 42, 0.18)';
      badge = '🌇 Hoàng hôn';
    }
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    document.getElementById('daylight-badge').textContent = badge;

    // 8. Vẽ đồng thời dải Mini-Map & Bản đồ tuyến giao hàng
    this.drawMiniMap();
    this.drawRouteMap();
  }

  // ===== VẼ MINI-MAP DƯỚI CẢNH KHO (ĐÚNG ẢNH MẪU) =====
  drawMiniMap() {
    const ctx = this.miniMapCtx;
    const w = this.miniMapCanvas.width;
    const h = this.miniMapCanvas.height;

    ctx.fillStyle = '#c5e495';
    ctx.fillRect(0, 0, w, h);

    // Đường uốn lượn
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 72);
    ctx.bezierCurveTo(95, 28, 175, 92, 262, 54);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(18, 72);
    ctx.bezierCurveTo(95, 28, 175, 92, 262, 54);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nhà Khu 1 & Cửa hàng Khu 2 bằng asset thật
    const house = this.assets.get('city-house.png');
    const shop = this.assets.get('city-shop.png');
    if (house) ctx.drawImage(house, 14, 10, 42, 42);
    if (shop) ctx.drawImage(shop, 224, 8, 44, 44);

    // Xe đang chạy trên mini-map
    if (this.activeVehicles.length > 0) {
      this.activeVehicles.forEach((v) => {
        const t = Math.min(1, Math.max(0, v.progress));
        const px = 28 + t * 215;
        const py = 58 + Math.sin(t * Math.PI * 2) * 14;
        const spr = this.assets.get(v.frames[v.frameIndex]) || this.assets.get(v.fallbackAsset);
        if (spr) ctx.drawImage(spr, px - 22, py - 22, 44, 44);
      });
    } else {
      const demoBike = this.assets.get('bike-1.png') || this.assets.get('bike-delivery.png');
      if (demoBike) ctx.drawImage(demoBike, 118, 32, 42, 42);
    }
  }

  // ===== VẼ BẢN ĐỒ THẬT TRONG TAB PHỐI XE & BẢN ĐỒ =====
  drawRouteMap() {
    const ctx = this.routeMapCtx;
    const w = this.routeMapCanvas.width;
    const h = this.routeMapCanvas.height;

    ctx.fillStyle = '#bfe08e';
    ctx.fillRect(0, 0, w, h);

    // Tuyến đường nối Kho -> Khu 1 -> Khu 2
    const drawRoad = (x1, y1, x2, y2, highlight) => {
      ctx.save();
      ctx.strokeStyle = highlight ? '#f47a2a' : '#64748b';
      ctx.lineWidth = highlight ? 22 : 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 24, x2, y2);
      ctx.stroke();

      ctx.strokeStyle = highlight ? '#fef08a' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 24, x2, y2);
      ctx.stroke();
      ctx.restore();
    };

    drawRoad(55, 115, 200, 75, this.selectedZoneId === 'zone1' || this.selectedZoneId === 'zone2');
    drawRoad(200, 75, 330, 105, this.selectedZoneId === 'zone2');

    // Điểm xuất phát: Kho trung tâm
    const boxesImg = this.assets.get('boxes.png');
    if (boxesImg) ctx.drawImage(boxesImg, 24, 82, 54, 54);
    ctx.fillStyle = '#3d220d';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('KHO', 38, 148);

    // Khu 1: city-house.png
    const houseImg = this.assets.get('city-house.png');
    if (houseImg) ctx.drawImage(houseImg, 170, 26, 62, 62);
    ctx.fillText('Khu 1', 184, 102);

    // Khu 2: city-shop.png
    const shopImg = this.assets.get('city-shop.png');
    const z2Unlocked = this.state.level >= GAME_CONFIG.unlocks.zone2AndRushLevel;
    ctx.save();
    if (!z2Unlocked) ctx.globalAlpha = 0.45;
    if (shopImg) ctx.drawImage(shopImg, 298, 52, 64, 64);
    ctx.restore();
    ctx.fillText(z2Unlocked ? 'Khu 2' : 'Khu 2 (Lv3)', 302, 130);

    // Xe đang chạy trực tiếp trên bản đồ tuyến đường
    this.activeVehicles.forEach((v) => {
      const t = Math.min(1, Math.max(0, v.progress));
      const endX = v.zone && v.zone.id === 'zone2' ? 325 : 198;
      const endY = v.zone && v.zone.id === 'zone2' ? 92 : 70;
      const vx = 55 + (endX - 55) * t;
      const vy = 112 + (endY - 112) * t - Math.sin(t * Math.PI) * 16;
      const spr = this.assets.get(v.frames[v.frameIndex]) || this.assets.get(v.fallbackAsset);
      if (spr) ctx.drawImage(spr, vx - 26, vy - 26, 52, 52);
    });
  }

  // ===== CẬP NHẬT HUD & TẤT CẢ PANEL =====
  updateClockHUD() {
    const progress = Math.min(1, this.state.dayElapsed / GAME_CONFIG.dayDurationSec);
    const totalMinutes = Math.floor(8 * 60 + progress * 12 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    document.getElementById('stat-clock').textContent = `${hh}:${mm}`;
    document.getElementById('stat-phase').textContent = progress > 0.78 ? '🌙' : progress > 0.58 ? '🌇' : '☀️';
  }

  renderAllUI() {
    document.getElementById('stat-day-label').textContent = `Ngày ${this.state.day}`;
    document.getElementById('stat-money').textContent = this.state.money.toLocaleString();
    document.getElementById('stat-rep').textContent = this.state.reputation;
    document.getElementById('stat-level').textContent = this.state.level;

    const reqXp = GAME_CONFIG.xpPerLevel(this.state.level);
    document.getElementById('stat-xp').textContent = `${this.state.xp}/${reqXp}`;
    const pct = Math.min(100, Math.round((this.state.xp / reqXp) * 100));
    document.getElementById('xp-bar-fill').style.width = `${pct}%`;

    this.renderOrderStrip();
    this.renderDockPacking();
    this.renderShelves();
    this.renderPacking();
    this.renderDispatch();
    this.renderSupplier();
    this.renderStaff();
  }

  // Thẻ đơn hàng dạng thẻ game có hình món hàng
  renderOrderStrip() {
    const strip = document.getElementById('orders-strip');
    document.getElementById('order-count').textContent = this.state.orders.length;
    strip.innerHTML = '';

    const statusShort = {
      picking: 'Soạn',
      ready_to_pack: 'Chờ gói',
      packing: 'Đang gói',
      packed: 'Sẵn xe',
      delivering: 'Đang giao'
    };

    for (const o of this.state.orders) {
      const card = document.createElement('div');
      card.className = `ticket-card ${o.isRush ? 'rush' : ''} ${this.selectedOrderId === o.id ? 'selected' : ''}`;
      card.onclick = () => { this.selectedOrderId = o.id; this.renderAllUI(); };

      const itemsHtml = o.items.map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId);
        const isDone = it.picked >= it.qty;
        return `<span class="item-pill ${isDone ? 'done' : ''}">${p.icon} ${it.picked}/${it.qty}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="ticket-top">
          <span>#${o.id}${o.isRush ? ' 🔥' : ''}</span>
          <span>⏱ ${Math.max(0, Math.ceil(o.timeLeft))}s</span>
        </div>
        <div class="ticket-items">${itemsHtml}</div>
        <div class="ticket-foot">
          <span>$${o.reward}</span>
          <span>${statusShort[o.status]}</span>
        </div>
      `;
      strip.appendChild(card);
    }
  }

  // Panel bàn đóng gói mini ở dải dưới
  renderDockPacking() {
    const box = document.getElementById('dock-packing-cards');
    box.innerHTML = '';
    const boxSrc = this.assets.getSrc('boxes.png');
    const tableSrc = this.assets.getSrc('packing-table.png');

    for (const t of this.state.packingTables) {
      const div = document.createElement('div');
      div.className = 'mini-pack-card';
      div.title = 'Bấm để gán đơn hoặc mở tab Đóng gói';
      div.onclick = () => {
        if (!t.orderId) this.assignToPackingTable(t.id);
      };
      const pct = t.orderId ? Math.min(100, Math.floor(t.progress)) : 0;
      div.innerHTML = `
        <img src="${t.orderId ? boxSrc : tableSrc}" alt="Bàn ${t.id}" />
        <strong>${t.orderId ? `Đơn #${t.orderId} (${pct}%)` : `Bàn #${t.id} Trống`}</strong>
        <div class="mini-prog-track"><div class="mini-prog-fill" style="width:${pct}%"></div></div>
      `;
      box.appendChild(div);
    }
  }

  renderShelves() {
    const hint = document.getElementById('pick-hint');
    const selected = this.state.orders.find((o) => o.id === this.selectedOrderId);
    if (!selected) {
      hint.innerHTML = 'Chọn một thẻ đơn hàng phía trên để bắt đầu soạn hàng bằng cách bấm đúng món trên kệ.';
    } else if (selected.status !== 'picking') {
      hint.innerHTML = `Đang chọn <strong>Đơn #${selected.id}</strong> — đã soạn xong (chuyển sang tab <strong>Đóng gói</strong> hoặc <strong>Phối xe</strong>).`;
    } else {
      const needText = selected.items.map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId);
        return `${p.icon} ${p.name} (${it.picked}/${it.qty})`;
      }).join(' • ');
      hint.innerHTML = `✅ Đang soạn <strong>Đơn #${selected.id}</strong> — Cần lấy: <strong>${needText}</strong>`;
    }

    const grid = document.getElementById('shelf-grid');
    grid.innerHTML = '';
    const coldUnlocked = this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;

    for (const p of PRODUCTS) {
      const locked = p.cold && !coldUnlocked;
      const qty = this.getStockCount(p.id);
      const minHsd = this.getMinShelfLife(p.id);
      const rackSrc = this.assets.getSrc(p.cold ? 'shelf-cold.png' : 'shelf-rack.png');
      const hsdClass = minHsd === null ? 'hsd-none' : minHsd <= 2 ? 'hsd-warn' : 'hsd-ok';
      const hsdText = minHsd !== null ? `HSD: ${minHsd} ngày` : (p.shelfLife ? 'Hết hàng' : 'Không HSD');

      const card = document.createElement('div');
      card.className = `vcard ${p.cold ? 'cold' : ''} ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${rackSrc}" alt="${p.name}" />
          <div class="vcard-info">
            <div class="vcard-title">${p.icon} ${p.name} (Tồn: ${qty})</div>
            <span class="hsd-tag ${hsdClass}">${hsdText}</span>
          </div>
        </div>
        <button class="game-btn btn-teal" ${locked || qty <= 0 ? 'disabled' : ''}>${locked ? '🔒 Mở ở Cấp 2' : '✋ Soạn 1 món'}</button>
      `;
      card.querySelector('button').onclick = () => this.pickFromShelf(p.id);
      grid.appendChild(card);
    }
  }

  renderPacking() {
    const boxSrc = this.assets.getSrc('boxes.png');
    document.getElementById('supplies-bar').innerHTML = `
      <div class="sup-chip"><img src="${boxSrc}" alt="Thùng" /> Thùng carton: <strong>${this.state.supplies.box}</strong></div>
      <div class="sup-chip"><img src="${boxSrc}" alt="Băng dính" /> Băng dính: <strong>${this.state.supplies.tape}</strong></div>
      <div class="sup-chip"><img src="${this.assets.getSrc('shelf-cold.png')}" alt="Túi lạnh" /> Túi giữ lạnh: <strong>${this.state.supplies.coldBag}</strong></div>
    `;

    const grid = document.getElementById('packing-tables');
    grid.innerHTML = '';
    const readyCount = this.state.orders.filter((o) => o.status === 'ready_to_pack').length;
    const tableSrc = this.assets.getSrc('packing-table.png');

    for (const t of this.state.packingTables) {
      const pct = t.orderId ? Math.min(100, Math.floor(t.progress)) : 0;
      const card = document.createElement('div');
      card.className = 'vcard';
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${t.orderId ? boxSrc : tableSrc}" alt="Bàn ${t.id}" />
          <div class="vcard-info">
            <div class="vcard-title">Bàn đóng gói #${t.id}</div>
            <div class="vcard-sub">${t.orderId ? `Đang gói Đơn #${t.orderId} (${pct}%)` : `Chờ đóng gói: ${readyCount} đơn`}</div>
          </div>
        </div>
        <div class="mini-prog-track"><div class="mini-prog-fill" style="width:${pct}%"></div></div>
        <button class="game-btn btn-orange" ${t.orderId || readyCount === 0 ? 'disabled' : ''}>📦 Đóng gói 1 đơn</button>
      `;
      card.querySelector('button').onclick = () => this.assignToPackingTable(t.id);
      grid.appendChild(card);
    }
  }

  renderDispatch() {
    const packedList = document.getElementById('packed-orders-list');
    packedList.innerHTML = '';
    const packed = this.state.orders.filter((o) => o.status === 'packed');
    const boxSrc = this.assets.getSrc('boxes.png');

    if (packed.length === 0) {
      packedList.innerHTML = '<div class="vcard-sub">Chưa có đơn đã đóng gói.</div>';
    } else {
      for (const o of packed) {
        const row = document.createElement('label');
        row.className = 'select-tile';
        const checked = this.selectedPackedIds.has(o.id) ? 'checked' : '';
        row.innerHTML = `
          <span style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" ${checked} />
            <img src="${boxSrc}" alt="Kiện hàng" />
            <strong>Đơn #${o.id}</strong> ($${o.reward})
          </span>
          <span>⏱ ${Math.ceil(o.timeLeft)}s</span>
        `;
        row.querySelector('input').onchange = (e) => {
          if (e.target.checked) this.selectedPackedIds.add(o.id);
          else this.selectedPackedIds.delete(o.id);
        };
        packedList.appendChild(row);
      }
    }

    const vehBox = document.getElementById('vehicle-selector');
    vehBox.innerHTML = '';
    for (const [key, cfg] of Object.entries(VEHICLE_TYPES)) {
      const owned = this.state.fleet[key];
      const locked = this.state.level < cfg.unlockLevel;
      const vehSrc = this.assets.getSrc(cfg.idleAsset);
      const row = document.createElement('label');
      row.className = 'select-tile';
      row.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;">
          <input type="radio" name="veh" value="${key}" ${this.selectedVehicleType === key ? 'checked' : ''} ${locked || owned <= 0 ? 'disabled' : ''} />
          <img src="${vehSrc}" alt="${cfg.name}" />
          <span><strong>${cfg.name}</strong> (${cfg.capacity} đơn)</span>
        </span>
        <span>Có: ${owned} • Xăng $${cfg.fuelCost}</span>
      `;
      row.querySelector('input').onchange = () => { this.selectedVehicleType = key; };
      vehBox.appendChild(row);
    }

    const zoneBox = document.getElementById('zone-map');
    zoneBox.innerHTML = '';
    for (const z of ZONES) {
      const locked = this.state.level < z.unlockLevel;
      const zSrc = this.assets.getSrc(z.asset);
      const div = document.createElement('div');
      div.className = `zone-pill ${this.selectedZoneId === z.id ? 'selected' : ''} ${locked ? 'locked' : ''}`;
      div.innerHTML = `
        <img src="${zSrc}" alt="${z.name}" />
        <div>
          <div><strong>${z.name}</strong></div>
          <div class="vcard-sub">${locked ? `🔒 Mở Cấp ${z.unlockLevel}` : `Xăng ×${z.distanceMult} • +$${z.bonus}`}</div>
        </div>
      `;
      if (!locked) {
        div.onclick = () => { this.selectedZoneId = z.id; this.renderDispatch(); };
      }
      zoneBox.appendChild(div);
    }
  }

  renderSupplier() {
    const pGrid = document.getElementById('supplier-products');
    pGrid.innerHTML = '';
    for (const p of PRODUCTS) {
      const locked = p.cold && this.state.level < GAME_CONFIG.unlocks.coldShelfLevel;
      const rackSrc = this.assets.getSrc(p.cold ? 'shelf-cold.png' : 'shelf-rack.png');
      const hsdClass = p.shelfLife === null ? 'hsd-none' : p.shelfLife <= 3 ? 'hsd-warn' : 'hsd-ok';
      const card = document.createElement('div');
      card.className = `vcard ${p.cold ? 'cold' : ''} ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${rackSrc}" alt="${p.name}" />
          <div class="vcard-info">
            <div class="vcard-title">${p.icon} ${p.name} ($${p.buyPrice}/sp)</div>
            <span class="hsd-tag ${hsdClass}">${p.shelfLife ? `HSD: ${p.shelfLife} ngày` : 'Không hết hạn'}</span>
          </div>
        </div>
        <button class="game-btn btn-teal" ${locked ? 'disabled' : ''}>Đặt 5 sp ($${p.buyPrice * 5})</button>
      `;
      card.querySelector('button').onclick = () => this.buyProductFromSupplier(p.id, 5);
      pGrid.appendChild(card);
    }

    const sGrid = document.getElementById('supplier-supplies');
    sGrid.innerHTML = '';
    const boxSrc = this.assets.getSrc('boxes.png');
    for (const sup of Object.values(SUPPLIES)) {
      const supSrc = sup.id === 'coldBag' ? this.assets.getSrc('shelf-cold.png') : boxSrc;
      const card = document.createElement('div');
      card.className = 'vcard';
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${supSrc}" alt="${sup.name}" />
          <div class="vcard-info">
            <div class="vcard-title">${sup.icon} ${sup.name}</div>
            <div class="vcard-sub">$${sup.price}/cái • Nhận ngay</div>
          </div>
        </div>
        <button class="game-btn btn-orange">Mua 5 cái ($${sup.price * 5})</button>
      `;
      card.querySelector('button').onclick = () => this.buySupply(sup.id, 5);
      sGrid.appendChild(card);
    }

    const pend = document.getElementById('pending-deliveries');
    const truckSrc = this.assets.getSrc('truck-small.png');
    if (this.state.pendingDeliveries.length === 0) {
      pend.innerHTML = `<img src="${truckSrc}" alt="Xe hàng" /> <span>Chưa có hàng chờ giao sáng mai</span>`;
    } else {
      const summary = this.state.pendingDeliveries.map((d) => {
        const p = PRODUCTS.find((x) => x.id === d.productId);
        return `${p.name} ×${d.qty}`;
      }).join(', ');
      pend.innerHTML = `<img src="${truckSrc}" alt="Xe hàng" /> <span>Sáng mai về: ${summary}</span>`;
    }
  }

  renderStaff() {
    const grid = document.getElementById('staff-panel');
    grid.innerHTML = '';

    const cards = [
      {
        img: this.assets.getSrc('worker-warehouse.png'),
        title: `Nhân viên kho (${this.state.staff.workers})`,
        meta: `Lương: $${GAME_CONFIG.staff.workerDailyWage}/ngày • Tăng tốc gói`,
        btn: `Tuyển ($${GAME_CONFIG.staff.workerHireCost})`,
        btnCls: 'btn-teal',
        action: () => this.hireStaff('workers')
      },
      {
        img: this.assets.getSrc('driver.png'),
        title: `Tài xế (${this.state.staff.drivers})`,
        meta: `Lương: $${GAME_CONFIG.staff.driverDailyWage}/ngày`,
        btn: `Tuyển ($${GAME_CONFIG.staff.driverHireCost})`,
        btnCls: 'btn-teal',
        action: () => this.hireStaff('drivers')
      },
      ...Object.entries(VEHICLE_TYPES).map(([k, v]) => ({
        img: this.assets.getSrc(v.idleAsset),
        title: `${v.name} (${this.state.fleet[k]})`,
        meta: `Chở ${v.capacity} đơn • Bảo hiểm $10/ngày`,
        btn: this.state.level < v.unlockLevel ? `🔒 Cấp ${v.unlockLevel}` : `Mua ($${v.buyCost})`,
        btnCls: 'btn-orange',
        disabled: this.state.level < v.unlockLevel,
        action: () => this.buyVehicle(k)
      }))
    ];

    for (const c of cards) {
      const div = document.createElement('div');
      div.className = `vcard ${c.disabled ? 'locked' : ''}`;
      div.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${c.img}" alt="${c.title}" />
          <div class="vcard-info">
            <div class="vcard-title">${c.title}</div>
            <div class="vcard-sub">${c.meta}</div>
          </div>
        </div>
        <button class="game-btn ${c.btnCls}" ${c.disabled ? 'disabled' : ''}>${c.btn}</button>
      `;
      div.querySelector('button').onclick = c.action;
      grid.appendChild(div);
    }

    document.getElementById('unlocks-panel').innerHTML = `
      <strong>Mốc mở khóa:</strong>
      Cấp 2: Kệ lạnh & Đông lạnh (${this.state.level >= 2 ? '✅' : '🔒'}) •
      Cấp 3: Khu 2 & Đơn gấp (${this.state.level >= 3 ? '✅' : '🔒'}) •
      Cấp 8: Xe tải lớn 6 đơn (${this.state.level >= 8 ? '✅' : '🔒'})
    `;
  }

  renderAssetModal() {
    const list = document.getElementById('asset-list');
    list.innerHTML = '';
    for (const [name, ok] of this.assets.status.entries()) {
      const div = document.createElement('div');
      div.className = 'asset-item';
      const cls = ok === true ? 'ok' : ok === 'loading' ? 'loading-tag' : 'missing';
      const txt = ok === true ? '✓ Có' : ok === 'loading' ? 'Đang tải...' : 'Thiếu';
      div.innerHTML = `<span>${name}</span><span class="${cls}">${txt}</span>`;
      list.appendChild(div);
    }
  }

  log(msg) {
    const ul = document.getElementById('event-log');
    const li = document.createElement('li');
    const t = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    li.textContent = `[${t}] ${msg}`;
    ul.prepend(li);
    if (ul.children.length > 35) ul.lastChild.remove();
  }

  loop(timestamp) {
    const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    this.updateLogic(rawDt * this.speedMultiplier);
    this.drawScene();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new LogisticCenterGame();
  game.init();
});

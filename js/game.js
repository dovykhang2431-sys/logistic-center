/**
 * Logistic Center — Phase 1 (v1.0)
 * Toàn bộ hệ thống game Phase 1 + tích hợp hệ thống animation (entities.js, AssetManager)
 */
class LogisticCenterGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
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
    this.lastTime = 0;

    // Thực thể hoạt hình (giữ nguyên hệ thống entities.js)
    this.conveyor = new AnimatedEntity({
      x: 280, y: 215, width: 170, height: 170,
      frames: ASSET_MANIFEST.animations.conveyor,
      fps: 6, label: 'Conveyor'
    });
    this.forklift = new ForkliftEntity(230, 315);
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
      dayElapsed: 0, // giây trong ngày (0 -> dayDurationSec)
      money: GAME_CONFIG.startingMoney, // $2,000
      reputation: GAME_CONFIG.startingReputation, // 50 (0..100)
      level: 1,
      xp: 0,
      nextOrderId: 1,
      // Kho hàng theo từng lô để theo dõi hạn sử dụng (HSD)
      inventory: {
        electronics: [{ qty: 6, daysLeft: null }],
        clothing: [{ qty: 6, daysLeft: null }],
        household: [{ qty: 6, daysLeft: null }],
        food: [{ qty: 5, daysLeft: 3 }],
        beverage: [{ qty: 6, daysLeft: 5 }],
        frozen: [] // Cần kệ lạnh (mở khóa cấp 2)
      },
      // Vật tư đóng gói
      supplies: { box: 12, tape: 12, coldBag: 4 },
      // Đơn đặt hàng nhà cung cấp (về sáng hôm sau)
      pendingDeliveries: [],
      // Bàn đóng gói (mỗi bàn xử lý 1 đơn)
      packingTables: [
        { id: 1, orderId: null, progress: 0 },
        { id: 2, orderId: null, progress: 0 }
      ],
      // Đội xe sở hữu (tính bảo hiểm $10/xe/ngày)
      fleet: { bike: 1, truckSmall: 1, truckLarge: 0 },
      // Nhân sự (tính lương theo ngày)
      staff: { workers: 1, drivers: 1 },
      // Danh sách đơn hàng hiện tại
      orders: [],
      // Thống kê trong ngày cho màn tổng kết
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

  async init() {
    document.getElementById('app-version').textContent = `v${VERSION}`;
    await this.assets.loadAll();
    this.loadGame();
    this.syncVisualStaff();
    this.renderAssetModal();
    this.renderAllUI();
    this.log(`Chào mừng đến với Logistic Center v${VERSION}!`);
    if (this.state.orders.length === 0) {
      this.spawnOrder();
      this.spawnOrder();
    }
    requestAnimationFrame((t) => this.loop(t));
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
      this.workers.push(new WorkerEntity(200 + i * 35, 190 + (i % 2) * 35));
    }
    this.drivers = [];
    for (let i = 0; i < this.state.staff.drivers; i++) {
      this.drivers.push(new DriverEntity(460 + i * 40, 290 + (i % 2) * 20));
    }
  }

  // ===== GIAO DIỆN & SỰ KIỆN =====
  bindUI() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        this.renderAllUI();
      };
    });

    document.getElementById('btn-pause').onclick = () => {
      this.paused = !this.paused;
      document.getElementById('btn-pause').textContent = this.paused ? '▶️ Tiếp tục' : '⏸️ Tạm dừng';
      if (this.paused) this.saveGame('tạm dừng');
    };

    document.getElementById('btn-speed').onclick = () => {
      this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
      document.getElementById('btn-speed').textContent = `⏩ ${this.speedMultiplier}x`;
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

    document.getElementById('btn-reset').onclick = () => {
      if (confirm('Bạn có chắc muốn chơi lại từ đầu?')) this.resetGame();
    };

    document.getElementById('btn-new-order').onclick = () => this.spawnOrder();
    document.getElementById('btn-dispatch-go').onclick = () => this.dispatchSelectedOrders();
    document.getElementById('btn-next-day').onclick = () => this.startNextDay();
    document.getElementById('btn-restart-bankrupt').onclick = () => this.resetGame();

    // Tự lưu khi thoát hoặc ẩn tab
    window.addEventListener('beforeunload', () => this.saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveGame();
    });
  }

  // ===== TỒN KHO & HẠN SỬ DỤNG =====
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
    // Dùng lô gần hết hạn trước (FEFO)
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

  // ===== ĐƠN HÀNG (THƯỜNG / GẤP + ĐẾM NGƯỢC) =====
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

    const timeLimit = isRush ? 55 : 95;
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
      status: 'picking' // picking -> ready_to_pack -> packing -> packed -> delivering
    };

    this.state.orders.push(order);
    if (!this.selectedOrderId) this.selectedOrderId = order.id;
    this.log(`📩 Đơn #${order.id} (${isRush ? 'GẤP' : 'Thường'} — ${zoneCfg.name}) vừa đến.`);
    this.renderAllUI();
  }

  // ===== SOẠN HÀNG: BẤM ĐÚNG MÓN TRÊN KỆ =====
  pickFromShelf(productId) {
    const order = this.state.orders.find((o) => o.id === this.selectedOrderId && o.status === 'picking');
    if (!order) {
      this.log('⚠️ Hãy chọn một đơn hàng đang chờ soạn ở cột phải trước.');
      return;
    }
    const item = order.items.find((it) => it.productId === productId && it.picked < it.qty);
    if (!item) {
      this.log('❌ Món này không nằm trong danh sách cần soạn của đơn đang chọn!');
      return;
    }
    if (this.getStockCount(productId) <= 0) {
      this.log('⚠️ Hết hàng trên kệ! Hãy đặt mua ở tab Nhà cung cấp.');
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

  // ===== ĐÓNG GÓI (MỖI BÀN 1 ĐƠN, TỐN THÙNG / BĂNG DÍNH / TÚI GIỮ LẠNH) =====
  assignToPackingTable(tableId) {
    const table = this.state.packingTables.find((t) => t.id === tableId);
    if (!table || table.orderId !== null) return;

    const order = this.state.orders.find((o) => o.status === 'ready_to_pack');
    if (!order) {
      this.log('⚠️ Chưa có đơn nào soạn xong để đưa lên bàn đóng gói.');
      return;
    }

    // Kiểm tra vật tư
    if (this.state.supplies.box < 1 || this.state.supplies.tape < 1) {
      this.log('⚠️ Thiếu thùng carton hoặc băng dính! Mua thêm ở tab Nhà cung cấp.');
      return;
    }
    if (order.needsCold && this.state.supplies.coldBag < 1) {
      this.log('⚠️ Đơn có hàng đông lạnh cần 1 túi giữ lạnh! Mua thêm ở tab Nhà cung cấp.');
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

  // ===== MUA HÀNG NHÀ CUNG CẤP (HÀNG VỀ SÁNG HÔM SAU) =====
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
    this.log(`🛒 Đã đặt ${qty} ${prod.name} (-$${cost}). Hàng sẽ về sáng mai.`);
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

  // ===== PHỐI XE & BẢN ĐỒ GIAO HÀNG =====
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
      this.log('⚠️ Hãy tích chọn ít nhất 1 đơn đã đóng gói để chất lên xe.');
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
      x: 780,
      y: 160 + Math.random() * 60,
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

      // Cập nhật danh tiếng 0..100
      const repDelta = stars >= 5 ? 3 : stars === 4 ? 1 : stars === 3 ? 0 : -4;
      this.adjustReputation(repDelta);

      this.state.dayStats.deliveredCount += 1;
      this.state.dayStats.ratings.push(stars);
      this.state.orders = this.state.orders.filter((o) => o.id !== order.id);
    });

    this.state.money += totalEarned;
    this.state.dayStats.revenue += totalEarned;
    this.addXP(totalXp);

    const avgStar = (starsList.reduce((a, b) => a + b, 0) / starsList.length).toFixed(1);
    this.log(`⭐ Giao xong ${vehEntity.orders.length} đơn (+$${totalEarned}, +${totalXp} XP, đánh giá ${avgStar}★).`);
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

  // ===== NHÂN SỰ & MUA XE =====
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

  // ===== TỔNG KẾT NGÀY, CHI PHÍ CỐ ĐỊNH, HSD, PHÁ SẢN =====
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

    // Kiểm tra hạn sử dụng cuối ngày
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

    // Kiểm tra PHÁ SẢN nếu không trả được chi phí cố định
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
      <div class="sum-row"><span>Doanh thu giao hàng</span><strong style="color:#4ade80">+$${this.state.dayStats.revenue}</strong></div>
      <div class="sum-row"><span>Tiền nhập hàng & vật tư</span><span>-$${this.state.dayStats.purchaseCost}</span></div>
      <div class="sum-row"><span>Tiền xăng vận chuyển</span><span>-$${this.state.dayStats.fuelCost}</span></div>
      <div class="sum-row"><span>Lương nhân viên (${this.state.staff.workers} kho, ${this.state.staff.drivers} tài xế)</span><span>-$${wages}</span></div>
      <div class="sum-row"><span>Thuê kho ($50) + Điện nước ($20) + Bảo hiểm (${totalVehicles} xe × $10)</span><strong style="color:#f87171">-$${fixedTotal}</strong></div>
      <div class="sum-row"><span>Hàng hết hạn bị hủy</span><strong>${expiredCount} sp</strong></div>
      <div class="sum-row"><span>Số dư còn lại</span><strong style="color:#38bdf8">$${this.state.money}</strong></div>
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

    // Giao hàng từ nhà cung cấp về kho sáng hôm sau
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

  // ===== CẬP NHẬT VÒNG LẶP GAME =====
  updateLogic(dt) {
    if (this.paused || this.summaryOpen || this.bankrupt) return;

    // 1. Chu kỳ ngày/đêm
    this.state.dayElapsed += dt;
    if (this.state.dayElapsed >= GAME_CONFIG.dayDurationSec) {
      this.openDaySummary();
      return;
    }

    // 2. Tự sinh đơn hàng
    this.orderSpawnTimer += dt;
    if (this.orderSpawnTimer >= 16) {
      this.orderSpawnTimer = 0;
      if (this.state.orders.length < 5) this.spawnOrder();
    }

    // 3. Đếm ngược đơn hàng
    let uiDirty = false;
    for (const order of [...this.state.orders]) {
      if (order.status === 'delivering') continue;
      order.timeLeft -= dt;
      if (order.timeLeft <= 0) {
        this.state.orders = this.state.orders.filter((o) => o.id !== order.id);
        this.state.packingTables.forEach((t) => { if (t.orderId === order.id) { t.orderId = null; t.progress = 0; } });
        this.state.dayStats.failedCount += 1;
        this.adjustReputation(-8);
        this.log(`⏰ Đơn #${order.id} hết giờ! (-8 Danh tiếng)`);
        uiDirty = true;
      }
    }

    // 4. Tiến trình đóng gói (mỗi bàn 1 đơn, tăng tốc theo số nhân viên kho)
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

    // 5. Cập nhật thực thể hoạt hình
    this.conveyor.update(dt);
    this.forklift.update(dt);
    this.workers.forEach((w) => w.update(dt));
    this.drivers.forEach((d) => d.update(dt));
    this.activeVehicles.forEach((v) => v.update(dt));
    this.activeVehicles = this.activeVehicles.filter((v) => !v.done);

    this.updateClockHUD();
    if (uiDirty) this.renderAllUI();
  }

  // ===== VẼ CANVAS (KHO + NGÀY/ĐÊM + ANIMATION) =====
  drawScene() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const progress = this.state.dayElapsed / GAME_CONFIG.dayDurationSec;

    // Nền sân kho
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);

    // Đường giao hàng
    ctx.save();
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(760, 70);
    ctx.lineTo(840, 165);
    ctx.lineTo(120, 460);
    ctx.lineTo(0, 370);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(800, 120);
    ctx.lineTo(60, 420);
    ctx.stroke();
    ctx.restore();

    // Sàn kho
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(270, 95);
    ctx.lineTo(480, 190);
    ctx.lineTo(300, 290);
    ctx.lineTo(90, 195);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Vẽ asset tĩnh (nếu người dùng đã thêm ảnh gốc vào assets/)
    const drawStatic = (file, x, y, sz) => {
      const img = this.assets.get(file);
      if (img) ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz);
    };
    drawStatic('shelf-rack.png', 165, 160, 82);
    if (this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel) {
      drawStatic('shelf-cold.png', 240, 125, 82);
    }
    drawStatic('packing-table.png', 360, 170, 76);
    drawStatic('city-house.png', 710, 85, 76);
    if (this.state.level >= GAME_CONFIG.unlocks.zone2AndRushLevel) {
      drawStatic('city-shop.png', 625, 115, 76);
    }

    // Sắp xếp chiều sâu (Y-sorting) cho các thực thể chuyển động
    const drawList = [
      this.conveyor,
      ...this.workers,
      this.forklift,
      ...this.drivers,
      ...this.activeVehicles
    ].sort((a, b) => a.y - b.y);
    drawList.forEach((e) => e.draw(ctx, this.assets));

    // Hiệu ứng ánh sáng chu kỳ ngày/chiều/đêm
    let tint = 'rgba(0,0,0,0)';
    let badge = '☀️ Ban ngày';
    if (progress > 0.78) {
      tint = 'rgba(15, 23, 42, 0.36)';
      badge = '🌙 Buổi tối';
    } else if (progress > 0.58) {
      tint = 'rgba(234, 88, 12, 0.16)';
      badge = '🌇 Hoàng hôn';
    }
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    document.getElementById('daylight-badge').textContent = badge;
  }

  // ===== CẬP NHẬT UI =====
  updateClockHUD() {
    const progress = Math.min(1, this.state.dayElapsed / GAME_CONFIG.dayDurationSec);
    const totalMinutes = Math.floor(8 * 60 + progress * 12 * 60); // 08:00 -> 20:00
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    document.getElementById('stat-clock').textContent = `${hh}:${mm}`;
    document.getElementById('stat-phase').textContent = progress > 0.78 ? '🌙' : progress > 0.58 ? '🌇' : '☀️';
  }

  renderAllUI() {
    document.getElementById('stat-day').textContent = this.state.day;
    document.getElementById('stat-money').textContent = `$${this.state.money.toLocaleString()}`;
    document.getElementById('stat-rep').textContent = this.state.reputation;
    document.getElementById('stat-level').textContent = this.state.level;
    document.getElementById('stat-xp').textContent = `${this.state.xp}/${GAME_CONFIG.xpPerLevel(this.state.level)}`;

    this.renderOrders();
    this.renderShelves();
    this.renderPacking();
    this.renderDispatch();
    this.renderSupplier();
    this.renderStaff();
  }

  renderOrders() {
    const box = document.getElementById('orders-list');
    document.getElementById('order-count').textContent = this.state.orders.length;
    box.innerHTML = '';
    const statusLabel = {
      picking: 'Chờ soạn',
      ready_to_pack: 'Chờ đóng gói',
      packing: 'Đang đóng gói',
      packed: 'Đã đóng gói',
      delivering: 'Đang giao'
    };

    for (const o of this.state.orders) {
      const div = document.createElement('div');
      div.className = `order-card ${o.isRush ? 'rush' : ''} ${this.selectedOrderId === o.id ? 'selected' : ''}`;
      div.onclick = () => { this.selectedOrderId = o.id; this.renderAllUI(); };
      const itemsHtml = o.items.map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId);
        return `${p.icon} ${p.name} (${it.picked}/${it.qty})`;
      }).join(' • ');
      div.innerHTML = `
        <div class="order-top">
          <span>Đơn #${o.id} ${o.isRush ? '<span class="tag-rush">GẤP</span>' : ''}</span>
          <span>⏱️ ${Math.max(0, Math.ceil(o.timeLeft))}s</span>
        </div>
        <div>${itemsHtml}</div>
        <div class="order-top" style="font-weight:400; color:#94a3b8;">
          <span>$${o.reward} • +${o.xp}XP</span>
          <span class="tag-status">${statusLabel[o.status]}</span>
        </div>
      `;
      box.appendChild(div);
    }
  }

  renderShelves() {
    const grid = document.getElementById('shelf-grid');
    grid.innerHTML = '';
    const coldUnlocked = this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;

    for (const p of PRODUCTS) {
      const locked = p.cold && !coldUnlocked;
      const qty = this.getStockCount(p.id);
      const minHsd = this.getMinShelfLife(p.id);
      const card = document.createElement('div');
      card.className = `card ${p.cold ? 'cold' : ''} ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="card-title"><span>${p.icon} ${p.name}</span><span>Tồn: <strong>${qty}</strong></span></div>
        <div class="card-meta">${p.cold ? '❄️ Kệ lạnh (Cấp 2)' : 'Kệ thường'} • HSD: ${minHsd !== null ? minHsd + ' ngày' : (p.shelfLife ? 'Hết' : 'Không')}</div>
        <button ${locked || qty <= 0 ? 'disabled' : ''}>${locked ? '🔒 Mở ở Cấp 2' : '✋ Soạn 1 món'}</button>
      `;
      card.querySelector('button').onclick = () => this.pickFromShelf(p.id);
      grid.appendChild(card);
    }
  }

  renderPacking() {
    document.getElementById('supplies-bar').innerHTML = `
      <span>📦 Thùng: <strong>${this.state.supplies.box}</strong></span>
      <span>🎞️ Băng dính: <strong>${this.state.supplies.tape}</strong></span>
      <span>❄️ Túi giữ lạnh: <strong>${this.state.supplies.coldBag}</strong></span>
    `;
    const grid = document.getElementById('packing-tables');
    grid.innerHTML = '';
    const readyCount = this.state.orders.filter((o) => o.status === 'ready_to_pack').length;

    for (const t of this.state.packingTables) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-title"><span>🧰 Bàn đóng gói #${t.id}</span><span>${t.orderId ? `Đơn #${t.orderId}` : 'Trống'}</span></div>
        <div class="card-meta">${t.orderId ? `Tiến độ: ${Math.floor(t.progress)}%` : `Đơn chờ đóng gói: ${readyCount}`}</div>
        <button ${t.orderId || readyCount === 0 ? 'disabled' : ''}>📦 Đóng gói 1 đơn</button>
      `;
      card.querySelector('button').onclick = () => this.assignToPackingTable(t.id);
      grid.appendChild(card);
    }
  }

  renderDispatch() {
    const packedList = document.getElementById('packed-orders-list');
    packedList.innerHTML = '';
    const packed = this.state.orders.filter((o) => o.status === 'packed');
    if (packed.length === 0) {
      packedList.innerHTML = '<div class="card-meta">Chưa có đơn đã đóng gói.</div>';
    } else {
      for (const o of packed) {
        const row = document.createElement('label');
        row.className = 'check-row';
        const checked = this.selectedPackedIds.has(o.id) ? 'checked' : '';
        row.innerHTML = `
          <span><input type="checkbox" ${checked} /> Đơn #${o.id} ($${o.reward})</span>
          <span>⏱️ ${Math.ceil(o.timeLeft)}s</span>
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
      const row = document.createElement('label');
      row.className = 'check-row';
      row.innerHTML = `
        <span><input type="radio" name="veh" value="${key}" ${this.selectedVehicleType === key ? 'checked' : ''} ${locked || owned <= 0 ? 'disabled' : ''} /> ${cfg.icon} ${cfg.name} (${cfg.capacity} đơn)</span>
        <span>Sở hữu: ${owned} • Xăng $${cfg.fuelCost}</span>
      `;
      row.querySelector('input').onchange = () => { this.selectedVehicleType = key; };
      vehBox.appendChild(row);
    }

    const zoneBox = document.getElementById('zone-map');
    zoneBox.innerHTML = '';
    for (const z of ZONES) {
      const locked = this.state.level < z.unlockLevel;
      const div = document.createElement('div');
      div.className = `zone-card ${this.selectedZoneId === z.id ? 'selected' : ''} ${locked ? 'locked' : ''}`;
      div.innerHTML = `
        <div><strong>${z.name}</strong></div>
        <div class="card-meta">${locked ? `🔒 Mở ở Cấp ${z.unlockLevel}` : `Xăng ×${z.distanceMult} • Thưởng +$${z.bonus}`}</div>
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
      const card = document.createElement('div');
      card.className = `card ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="card-title"><span>${p.icon} ${p.name}</span><span>$${p.buyPrice}/sp</span></div>
        <div class="card-meta">HSD: ${p.shelfLife ? p.shelfLife + ' ngày' : 'Không'}</div>
        <button ${locked ? 'disabled' : ''}>Đặt 5 sp ($${p.buyPrice * 5})</button>
      `;
      card.querySelector('button').onclick = () => this.buyProductFromSupplier(p.id, 5);
      pGrid.appendChild(card);
    }

    const sGrid = document.getElementById('supplier-supplies');
    sGrid.innerHTML = '';
    for (const sup of Object.values(SUPPLIES)) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-title"><span>${sup.icon} ${sup.name}</span><span>$${sup.price}/cái</span></div>
        <button>Mua 5 cái ($${sup.price * 5})</button>
      `;
      card.querySelector('button').onclick = () => this.buySupply(sup.id, 5);
      sGrid.appendChild(card);
    }

    const pend = document.getElementById('pending-deliveries');
    if (this.state.pendingDeliveries.length === 0) {
      pend.textContent = 'Chưa có đơn hàng nhà cung cấp nào chờ giao sáng mai.';
    } else {
      const summary = this.state.pendingDeliveries.map((d) => {
        const p = PRODUCTS.find((x) => x.id === d.productId);
        return `${p.name} ×${d.qty}`;
      }).join(', ');
      pend.textContent = `🚚 Chờ giao sáng mai: ${summary}`;
    }
  }

  renderStaff() {
    const grid = document.getElementById('staff-panel');
    grid.innerHTML = '';

    const cards = [
      {
        title: `👷 Nhân viên kho (${this.state.staff.workers})`,
        meta: `Lương: $${GAME_CONFIG.staff.workerDailyWage}/ngày • Tăng tốc đóng gói`,
        btn: `Tuyển ($${GAME_CONFIG.staff.workerHireCost})`,
        action: () => this.hireStaff('workers')
      },
      {
        title: `🧑‍✈️ Tài xế (${this.state.staff.drivers})`,
        meta: `Lương: $${GAME_CONFIG.staff.driverDailyWage}/ngày`,
        btn: `Tuyển ($${GAME_CONFIG.staff.driverHireCost})`,
        action: () => this.hireStaff('drivers')
      },
      ...Object.entries(VEHICLE_TYPES).map(([k, v]) => ({
        title: `${v.icon} ${v.name} (${this.state.fleet[k]})`,
        meta: `Sức chứa ${v.capacity} đơn • Bảo hiểm $10/ngày`,
        btn: this.state.level < v.unlockLevel ? `🔒 Cấp ${v.unlockLevel}` : `Mua ($${v.buyCost})`,
        disabled: this.state.level < v.unlockLevel,
        action: () => this.buyVehicle(k)
      }))
    ];

    for (const c of cards) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div class="card-title"><span>${c.title}</span></div>
        <div class="card-meta">${c.meta}</div>
        <button ${c.disabled ? 'disabled' : ''}>${c.btn}</button>
      `;
      div.querySelector('button').onclick = c.action;
      grid.appendChild(div);
    }

    document.getElementById('unlocks-panel').innerHTML = `
      • <strong>Cấp 2:</strong> Kệ lạnh & hàng Đông lạnh (${this.state.level >= 2 ? '✅ Đã mở' : '🔒 Chưa mở'})<br/>
      • <strong>Cấp 3:</strong> Khu 2 & Đơn gấp (${this.state.level >= 3 ? '✅ Đã mở' : '🔒 Chưa mở'})<br/>
      • <strong>Cấp 8:</strong> Xe tải lớn 6 đơn (${this.state.level >= 8 ? '✅ Đã mở' : '🔒 Chưa mở'})
    `;
  }

  renderAssetModal() {
    const list = document.getElementById('asset-list');
    list.innerHTML = '';
    for (const [name, ok] of this.assets.status.entries()) {
      const div = document.createElement('div');
      div.className = 'asset-item';
      div.innerHTML = `<span>${name}</span><span class="${ok ? 'ok' : 'missing'}">${ok ? '✓ Có' : 'Thiếu (Fallback)'}</span>`;
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

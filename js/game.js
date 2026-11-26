/**
 * Logistic Center — v1.3: Giao diện 6 khu vực dollhouse isometric + chuyển động 60fps mượt
 * Giữ nguyên 100% cơ chế & số liệu v1.1/v1.2 (tiền, kho, 3 nhà cung cấp, ngân hàng, phá sản, save key).
 * Tách riêng vòng lặp vẽ 60fps với vòng lặp logic, cập nhật DOM theo thay đổi thực để không giật và không mất bấm nút.
 */
class LogisticCenterGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.routeMapCanvas = document.getElementById('route-map-canvas');
    this.routeMapCtx = this.routeMapCanvas.getContext('2d');

    this.assets = new AssetManager();
    this.sceneRenderer = new Scene6ZonesRenderer(this.canvas, this.assets);

    this.state = this.createInitialState();
    this.selectedOrderId = null;
    this.selectedPackedIds = new Set();
    this.selectedVehicleType = 'bike';
    this.selectedZoneId = 'zone1';
    this.selectedSupplierId = 'fast247';

    this.drawerOpen = false;
    this.activeTabId = 'tab-orders';
    this.officeCombinedMode = false;

    this.paused = false;
    this.speedMultiplier = 1;
    this.bankrupt = false;
    this.summaryOpen = false;
    this.orderSpawnTimer = 0;
    this.liveTickTimer = 0;
    this.lastTime = 0;

    // Cache giá trị HUD đã hiển thị để chỉ chạm DOM khi số thực sự thay đổi
    this.hudCache = {
      clock: '', phase: '', day: -1, money: -1, loan: -1, rep: -1, level: -1, xpText: '', xpPct: -1
    };

    // Thực thể động 60fps đặt đúng vị trí trong 6 khu vực
    this.conveyor = new AnimatedEntity({
      x: 566, y: 374, height: 84,
      frames: ASSET_MANIFEST.animations.conveyor,
      fps: 6.5, label: 'Băng chuyền', fallbackAsset: 'conveyor.png',
      shadow: true
    });
    this.forklift = new ForkliftEntity(240, 214);
    this.workers = [];
    this.drivers = [];
    this.activeVehicles = [];
    this.receivingTrucks = [];

    // Đếm khung hình cho kiểm tra hiệu năng
    this.fpsStats = { frames: 0, lastReport: 0, fps: 60 };

    this.bindUI();
    this.registerPWA();
  }

  createEmptyReserve() {
    const res = {};
    for (const p of PRODUCTS) res[p.id] = [];
    return res;
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
      // Phase 2: Kho dự trữ (cùng cấu trúc batch {qty, daysLeft})
      reserve: this.createEmptyReserve(),
      // Phase 2: Ngân hàng
      bank: { loan: 0, savings: 0 },
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
    document.getElementById('btn-speed').textContent = `${this.speedMultiplier}x`;
    this.syncVisualStaff();
    this.renderAssetModal();
    this.renderAllUI();
    this.log(`Chào mừng đến với Logistic Center v${VERSION} — 6 khu vực!`);
    if (this.state.orders.length === 0) {
      this.spawnOrder();
      this.spawnOrder();
    }

    const loadingEl = document.getElementById('loading-overlay');
    if (this.assets.isLoadingPrimary()) loadingEl.classList.remove('hidden');

    this.lastTime = performance.now();
    this.fpsStats.lastReport = this.lastTime;
    requestAnimationFrame((t) => this.loop(t));

    // Bước 1: Tải ưu tiên ảnh cảnh chính + 6 icon sản phẩm
    this.assets.loadPrimary(() => {
      if (!this.assets.isLoadingPrimary()) {
        loadingEl.classList.add('hidden');
      }
      this.renderAssetModal();
    }).then(() => {
      loadingEl.classList.add('hidden');
      this.renderAllUI();
      this.renderAssetModal();
      // Bước 2: Lazy-load 26 khung hình animation ở nền
      this.assets.loadSecondary(() => {
        this.renderAssetModal();
      });
    });
  }

  registerPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ===== LƯU / TẢI LOCALSTORAGE ("logistic-center-v1") — TƯƠNG THÍCH SAVE CŨ v1.0.2 / v1.1 / v1.2 =====
  saveGame(reason = '') {
    if (this.bankrupt) return;
    try {
      this.state.version = VERSION;
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      if (reason) this.log(`💾 Đã tự lưu game (${reason}).`);
    } catch (e) {
      console.warn('Lưu localStorage thất bại:', e);
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.money === 'number' && typeof parsed.day === 'number') {
        const base = this.createInitialState();
        this.state = { ...base, ...parsed };

        // Tương thích save cũ (v1.0.2): bổ sung bank & reserve mặc định, giữ nguyên hàng trên kệ
        this.state.bank = {
          loan: Number(parsed.bank?.loan) || 0,
          savings: Number(parsed.bank?.savings) || 0
        };
        const mergedReserve = this.createEmptyReserve();
        if (parsed.reserve && typeof parsed.reserve === 'object') {
          for (const p of PRODUCTS) {
            if (Array.isArray(parsed.reserve[p.id])) {
              mergedReserve[p.id] = parsed.reserve[p.id];
            }
          }
        }
        this.state.reserve = mergedReserve;

        const mergedInv = {};
        for (const p of PRODUCTS) {
          mergedInv[p.id] = Array.isArray(parsed.inventory?.[p.id]) ? parsed.inventory[p.id] : [];
        }
        this.state.inventory = mergedInv;

        // Nâng cấp pendingDeliveries cũ (nếu chỉ có {productId, qty})
        if (Array.isArray(this.state.pendingDeliveries)) {
          this.state.pendingDeliveries = this.state.pendingDeliveries.map((d) => ({
            productId: d.productId,
            qty: d.qty,
            supplierId: d.supplierId || 'fast247',
            arriveDay: typeof d.arriveDay === 'number' ? d.arriveDay : this.state.day + 1,
            arriveHour: typeof d.arriveHour === 'number' ? d.arriveHour : 8,
            delayChecked: Boolean(d.delayChecked)
          }));
        } else {
          this.state.pendingDeliveries = [];
        }

        // Ân hạn tối thiểu 30 giây cho các đơn đang chờ sau khi tải lại trang
        if (Array.isArray(this.state.orders)) {
          this.state.orders.forEach((o) => {
            if (o.status !== 'delivering' && typeof o.timeLeft === 'number' && o.timeLeft < 30) {
              o.timeLeft = 30;
            }
          });
        }
        this.state.version = VERSION;
        this.log(`📂 Đã tải dữ liệu lưu (Ngày ${this.state.day}, $${this.state.money}).`);
        return true;
      }
    } catch (e) {
      console.warn('Tải save lỗi, dùng trạng thái mới:', e);
    }
    return false;
  }

  reloadFromLastSave() {
    const loaded = this.loadGame();
    if (!loaded) {
      alert('Chưa có bản lưu trước đó. Game sẽ bắt đầu lại từ đầu.');
      this.resetGame();
      return;
    }
    this.bankrupt = false;
    this.summaryOpen = false;
    this.paused = false;
    this.activeVehicles = [];
    this.receivingTrucks = [];
    this.selectedPackedIds.clear();
    this.speedMultiplier = this.state.speedMultiplier || 1;
    document.getElementById('btn-speed').textContent = `${this.speedMultiplier}x`;
    document.getElementById('btn-pause').textContent = '⏸';
    document.getElementById('bankrupt-modal').classList.add('hidden');
    document.getElementById('summary-modal').classList.add('hidden');
    this.syncVisualStaff();
    this.renderAllUI();
    this.log('📂 Đã khôi phục từ lần lưu gần nhất.');
  }

  resetGame() {
    localStorage.removeItem(SAVE_KEY);
    this.state = this.createInitialState();
    this.selectedOrderId = null;
    this.selectedPackedIds.clear();
    this.activeVehicles = [];
    this.receivingTrucks = [];
    this.bankrupt = false;
    this.summaryOpen = false;
    this.paused = false;
    this.speedMultiplier = 1;
    document.getElementById('btn-speed').textContent = '1x';
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
      const startX = 560 + (i % 3) * 58;
      const startY = 200 + (i % 2) * 18;
      this.workers.push(new WorkerEntity(startX, startY, i));
    }
    this.drivers = [];
    for (let i = 0; i < this.state.staff.drivers; i++) {
      const startX = 860 + (i % 3) * 32;
      const startY = 345 + (i % 2) * 24;
      this.drivers.push(new DriverEntity(startX, startY, i));
    }
  }

  // ===== SỰ KIỆN UI & TƯƠNG TÁC 6 KHU VỰC =====
  bindUI() {
    const drawer = document.getElementById('menu-drawer');
    const backdrop = document.getElementById('menu-backdrop');
    const drawerBody = document.getElementById('drawer-body');
    const zoneBanner = document.getElementById('drawer-zone-banner');

    const tabToZoneId = {
      'tab-supplier': 'receiving',
      'tab-pick': 'shelves',
      'tab-pack': 'packing',
      'tab-dispatch': 'dispatch',
      'tab-orders': 'orders',
      'tab-bank': 'office',
      'tab-staff': 'office',
      'office-combined': 'office'
    };

    this.openDrawerTab = (tabId, zoneInfo = null) => {
      this.drawerOpen = true;
      drawer.classList.remove('hidden');
      backdrop.classList.remove('hidden');

      if (tabId === 'office-combined') {
        this.officeCombinedMode = true;
        this.activeTabId = 'tab-bank';
        drawerBody.classList.add('office-mode');
        document.querySelectorAll('.dtab').forEach((b) => {
          b.classList.toggle('active', b.dataset.tab === 'tab-bank' || b.dataset.tab === 'tab-staff');
        });
        document.querySelectorAll('.tab-content').forEach((p) => {
          p.classList.toggle('active', p.id === 'tab-bank' || p.id === 'tab-staff');
        });
      } else {
        this.officeCombinedMode = false;
        this.activeTabId = tabId;
        drawerBody.classList.remove('office-mode');
        document.querySelectorAll('.dtab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach((p) => p.classList.toggle('active', p.id === tabId));
      }

      const zid = zoneInfo ? zoneInfo.id : tabToZoneId[tabId] || null;
      this.sceneRenderer.activeZoneId = zid;
      const zObj = zoneInfo || this.sceneRenderer.zones.find((z) => z.id === zid);
      if (zObj) {
        drawer.style.borderColor = zObj.accent;
        zoneBanner.style.background = zObj.accent;
        const subtitle = zObj.id === 'office'
          ? 'Ngân hàng (Vay vốn & Tiết kiệm) + Quản lý Nhân viên & Đội xe'
          : zObj.id === 'receiving'
            ? '3 Nhà cung cấp • Nhập hàng vào Kho dự trữ & Vật tư đóng gói'
            : zObj.id === 'shelves'
              ? 'Quản lý kệ X/12 từng sản phẩm • Soạn hàng & Bổ sung từ kho dự trữ'
              : zObj.id === 'packing'
                ? 'Danh sách đơn chờ đóng gói & Bàn đóng gói tự động'
                : zObj.id === 'dispatch'
                  ? 'Điều phối xe giao hàng & Theo dõi xe đang trên tuyến'
                  : 'Tiếp nhận đơn mới & Soạn nhanh theo lô';
        zoneBanner.innerHTML = `<span>${zObj.icon} ${zObj.name}</span><span style="opacity:0.92;font-weight:700;">${subtitle}</span>`;
        zoneBanner.classList.remove('hidden');
      } else {
        drawer.style.borderColor = '';
        zoneBanner.classList.add('hidden');
      }

      drawerBody.scrollTop = 0;
      this.renderVisiblePanel();
    };

    const closeDrawer = () => {
      this.drawerOpen = false;
      this.officeCombinedMode = false;
      this.sceneRenderer.activeZoneId = null;
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
      drawer.style.borderColor = '';
    };
    this.closeDrawer = closeDrawer;

    // Tương tác chuột / chạm trực tiếp lên 6 khu trên canvas
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drawerOpen) return;
      const hit = this.sceneRenderer.hitTestZone(e.clientX, e.clientY);
      this.sceneRenderer.hoveredZoneId = hit ? hit.id : null;
      this.canvas.classList.toggle('zone-hover', Boolean(hit));
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.sceneRenderer.hoveredZoneId = null;
      this.canvas.classList.remove('zone-hover');
    });

    this.canvas.addEventListener('click', (e) => {
      const hit = this.sceneRenderer.hitTestZone(e.clientX, e.clientY);
      if (!hit) return;
      const pt = this.sceneRenderer.screenToWorld(e.clientX, e.clientY);
      this.sceneRenderer.triggerClickRipple(hit.id, pt.x, pt.y);
      this.openDrawerTab(hit.tabId, hit);
    });

    window.addEventListener('resize', () => this.sceneRenderer.resize());

    document.getElementById('btn-open-menu').onclick = () => {
      if (!this.drawerOpen) {
        this.openDrawerTab(this.activeTabId || 'tab-orders');
      } else {
        closeDrawer();
      }
    };
    document.getElementById('btn-close-menu').onclick = closeDrawer;
    backdrop.onclick = closeDrawer;

    document.querySelectorAll('.dtab').forEach((btn) => {
      btn.onclick = () => this.openDrawerTab(btn.dataset.tab);
    });

    document.getElementById('btn-pause').onclick = () => {
      this.paused = !this.paused;
      document.getElementById('btn-pause').textContent = this.paused ? '▶' : '⏸';
      if (this.paused) this.saveGame('tạm dừng');
    };

    document.getElementById('btn-speed').onclick = () => {
      this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
      this.state.speedMultiplier = this.speedMultiplier;
      document.getElementById('btn-speed').textContent = `${this.speedMultiplier}x`;
      this.saveGame();
    };

    document.getElementById('btn-end-day').onclick = () => {
      if (!this.summaryOpen && !this.bankrupt) this.openDaySummary();
    };

    document.getElementById('btn-assets').onclick = () => {
      this.renderAssetModal();
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
    document.getElementById('btn-batch-pick').onclick = () => this.batchPickOrders();
    document.getElementById('btn-replenish-all').onclick = () => this.replenishAllShelves();
    document.getElementById('btn-dispatch-go').onclick = () => this.dispatchSelectedOrders();
    document.getElementById('btn-next-day').onclick = () => this.startNextDay();
    document.getElementById('btn-reload-last-save').onclick = () => this.reloadFromLastSave();
    document.getElementById('btn-restart-bankrupt').onclick = () => this.resetGame();

    // Ngân hàng
    document.getElementById('btn-borrow').onclick = () => {
      const inp = document.getElementById('input-loan-amount');
      this.borrowMoney(Number(inp.value));
      inp.value = '';
    };
    document.getElementById('btn-repay').onclick = () => {
      const inp = document.getElementById('input-repay-amount');
      this.repayLoan(Number(inp.value));
      inp.value = '';
    };
    document.getElementById('btn-deposit').onclick = () => {
      const inp = document.getElementById('input-savings-amount');
      this.depositSavings(Number(inp.value));
      inp.value = '';
    };
    document.getElementById('btn-withdraw').onclick = () => {
      const inp = document.getElementById('input-savings-amount');
      this.withdrawSavings(Number(inp.value));
      inp.value = '';
    };

    window.addEventListener('beforeunload', () => this.saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveGame();
    });
  }

  // ===== GIỜ GAME HIỆN TẠI (8.0 -> 20.0) =====
  getGameHour() {
    const progress = Math.min(1, this.state.dayElapsed / GAME_CONFIG.dayDurationSec);
    return 8 + progress * 12;
  }

  // ===== KHO KỆ, KHO DỰ TRỮ (RESERVE) & HẠN SỬ DỤNG =====
  getStockCount(productId) {
    return (this.state.inventory[productId] || []).reduce((s, b) => s + b.qty, 0);
  }

  getReserveCount(productId) {
    return (this.state.reserve[productId] || []).reduce((s, b) => s + b.qty, 0);
  }

  getMinShelfLife(productId) {
    const shelfBatches = (this.state.inventory[productId] || []).filter((b) => b.qty > 0 && b.daysLeft !== null);
    const reserveBatches = (this.state.reserve[productId] || []).filter((b) => b.qty > 0 && b.daysLeft !== null);
    const all = [...shelfBatches, ...reserveBatches];
    if (all.length === 0) return null;
    return Math.min(...all.map((b) => b.daysLeft));
  }

  // GIỮ NGUYÊN FEFO consumeStock()
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

  // Châm hàng từ kho dự trữ lên kệ (tối đa 12/món, lấy batch gần hết hạn trước)
  replenishShelf(productId, silent = false) {
    const prod = PRODUCTS.find((p) => p.id === productId);
    if (!prod) return 0;
    if (prod.cold && this.state.level < GAME_CONFIG.unlocks.coldShelfLevel) {
      if (!silent) this.log(`🔒 Cần đạt Cấp ${GAME_CONFIG.unlocks.coldShelfLevel} để dùng Kệ lạnh.`);
      return 0;
    }

    const reserveQty = this.getReserveCount(productId);
    if (reserveQty <= 0) {
      if (!silent) {
        this.log(`⚠️ Kho dự trữ trống (${prod.name}).`);
        alert('Kho dự trữ trống.');
      }
      return 0;
    }

    const currentShelf = this.getStockCount(productId);
    const space = GAME_CONFIG.shelfCapacity - currentShelf;
    if (space <= 0) {
      if (!silent) this.log(`ℹ️ Kệ ${prod.name} đã đầy (${GAME_CONFIG.shelfCapacity}/${GAME_CONFIG.shelfCapacity}).`);
      return 0;
    }

    const resBatches = this.state.reserve[productId] || [];
    resBatches.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

    let moved = 0;
    for (const batch of resBatches) {
      if (moved >= space) break;
      const take = Math.min(batch.qty, space - moved);
      if (take > 0) {
        batch.qty -= take;
        moved += take;
        this.state.inventory[productId].push({ qty: take, daysLeft: batch.daysLeft });
      }
    }
    this.state.reserve[productId] = resBatches.filter((b) => b.qty > 0);

    if (!silent && moved > 0) {
      this.log(`📥 Đã châm ${moved} ${prod.name} lên kệ (${this.getStockCount(productId)}/${GAME_CONFIG.shelfCapacity}).`);
      this.sceneRenderer.addFloatingText(630, 140, `+${moved} ${prod.name}`, '#0f766e');
      this.renderAllUI();
    }
    return moved;
  }

  replenishAllShelves() {
    let totalMoved = 0;
    let totalReserveAvailable = 0;
    const coldUnlocked = this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;

    for (const p of PRODUCTS) {
      if (p.cold && !coldUnlocked) continue;
      totalReserveAvailable += this.getReserveCount(p.id);
      totalMoved += this.replenishShelf(p.id, true);
    }

    if (totalReserveAvailable === 0) {
      this.log('⚠️ Kho dự trữ trống.');
      alert('Kho dự trữ trống.');
      return;
    }
    if (totalMoved === 0) {
      this.log(`ℹ️ Tất cả các kệ có hàng dự trữ đều đã đầy (${GAME_CONFIG.shelfCapacity}/${GAME_CONFIG.shelfCapacity}).`);
      return;
    }
    this.log(`📥 Đã châm tất cả: +${totalMoved} sp từ kho dự trữ lên kệ.`);
    this.sceneRenderer.addFloatingText(630, 140, `📥 +${totalMoved} lên kệ`, '#0f766e');
    this.renderAllUI();
  }

  // ===== ĐƠN HÀNG (260s THƯỜNG / 150s GẤP) =====
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

    const timeLimit = isRush ? 150 : 260;
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
    this.sceneRenderer.triggerBellPulse();
    this.log(`📩 Đơn #${order.id} (${isRush ? 'GẤP' : 'Thường'} — ${zoneCfg.name}) vừa đến.`);
    this.renderOrderStrip();
    if (this.drawerOpen) this.renderVisiblePanel();
  }

  // ===== SOẠN HÀNG TỪNG MÓN & SOẠN THEO LÔ (BATCH PICKING) =====
  pickFromShelf(productId) {
    const order = this.state.orders.find((o) => o.id === this.selectedOrderId && o.status === 'picking');
    if (!order) {
      this.log('⚠️ Hãy chọn một thẻ đơn hàng đang chờ soạn phía dưới trước.');
      return;
    }
    const item = order.items.find((it) => it.productId === productId && it.picked < it.qty);
    if (!item) {
      this.log('❌ Món này không nằm trong danh sách cần soạn của đơn đang chọn!');
      return;
    }
    if (this.getStockCount(productId) <= 0) {
      this.log('⚠️ Hết hàng trên kệ! Hãy Châm hàng từ kho dự trữ hoặc đặt mua ở tab Nhà cung cấp.');
      return;
    }

    this.consumeStock(productId, 1);
    item.picked += 1;

    const done = order.items.every((it) => it.picked >= it.qty);
    if (done) {
      order.status = 'ready_to_pack';
      this.log(`✅ Đơn #${order.id} đã soạn đủ hàng! Chuyển sang Khu Đóng gói.`);
    }
    this.renderAllUI();
  }

  batchPickOrders() {
    const pickingOrders = this.state.orders
      .filter((o) => o.status === 'picking')
      .sort((a, b) => a.id - b.id);

    if (pickingOrders.length === 0) {
      this.log('ℹ️ Không có đơn nào đang chờ soạn.');
      return;
    }

    let completedCount = 0;
    let shortageCount = 0;

    for (const order of pickingOrders) {
      for (const item of order.items) {
        const need = item.qty - item.picked;
        if (need <= 0) continue;
        const avail = this.getStockCount(item.productId);
        const take = Math.min(need, avail);
        if (take > 0) {
          this.consumeStock(item.productId, take);
          item.picked += take;
        }
      }
      if (order.items.every((it) => it.picked >= it.qty)) {
        order.status = 'ready_to_pack';
        completedCount += 1;
      } else {
        shortageCount += 1;
      }
    }

    this.log(`⚡ Đã soạn xong ${completedCount} đơn, ${shortageCount} đơn thiếu hàng.`);
    if (completedCount > 0) {
      this.sceneRenderer.addFloatingText(630, 155, `⚡ Xong ${completedCount} đơn`, '#0d9488');
    }
    this.renderAllUI();
  }

  // ===== ĐÓNG GÓI =====
  assignToPackingTable(tableId) {
    const table = this.state.packingTables.find((t) => t.id === tableId);
    if (!table || table.orderId !== null) return;

    const readyOrders = this.state.orders
      .filter((o) => o.status === 'ready_to_pack')
      .sort((a, b) => a.id - b.id);
    const order = readyOrders[0];
    if (!order) {
      this.log('⚠️ Chưa có đơn chờ đóng gói.');
      alert('Chưa có đơn chờ đóng gói.');
      return;
    }
    if (this.state.supplies.box < 1 || this.state.supplies.tape < 1) {
      this.log('⚠️ Thiếu thùng carton hoặc băng dính! Mua thêm ở Khu Nhập hàng.');
      return;
    }
    if (order.needsCold && this.state.supplies.coldBag < 1) {
      this.log('⚠️ Đơn đông lạnh cần 1 túi giữ lạnh! Mua thêm ở Khu Nhập hàng.');
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

  // ===== 3 NHÀ CUNG CẤP + CHIẾT KHẤU + GIAO TRỄ =====
  getBulkDiscount(qty) {
    if (qty >= 20) return 0.10;
    if (qty >= 10) return 0.05;
    return 0;
  }

  getSupplierUnitPrice(prod, supplier) {
    return Number((prod.buyPrice * supplier.priceMult).toFixed(2));
  }

  getSupplierOrderCost(prod, supplier, qty) {
    const discount = this.getBulkDiscount(qty);
    return Math.round(prod.buyPrice * supplier.priceMult * qty * (1 - discount));
  }

  spawnSupplyTruckVisual(text) {
    if (this.receivingTrucks.length < 2) {
      this.receivingTrucks.push(new IncomingSupplyTruck({
        onArrive: () => {
          this.sceneRenderer.addFloatingText(240, 145, text, '#d97706');
        }
      }));
    } else {
      this.sceneRenderer.addFloatingText(240, 145, text, '#d97706');
    }
  }

  buyProductFromSupplier(productId, qty = 5, supplierId = this.selectedSupplierId) {
    const prod = PRODUCTS.find((p) => p.id === productId);
    const supplier = SUPPLIERS.find((s) => s.id === supplierId);
    if (!prod || !supplier) return;

    if (!supplier.products.includes(productId)) {
      this.log(`❌ ${supplier.name} không bán ${prod.name}.`);
      return;
    }
    if (prod.cold && this.state.level < GAME_CONFIG.unlocks.coldShelfLevel) {
      this.log(`🔒 Cần đạt Cấp ${GAME_CONFIG.unlocks.coldShelfLevel} để mở khóa Kệ lạnh.`);
      return;
    }

    const cost = this.getSupplierOrderCost(prod, supplier, qty);
    if (this.state.money < cost) {
      this.log(`💸 Không đủ tiền đặt ${qty} ${prod.name} tại ${supplier.name} (cần $${cost}).`);
      return;
    }

    this.state.money -= cost;
    this.state.dayStats.purchaseCost += cost;

    // Nhà C: Giao ngay lập tức vào Kho dự trữ, không bao giờ trễ
    if (supplier.id === 'express') {
      this.state.reserve[productId].push({ qty, daysLeft: prod.shelfLife });
      this.log(`⚡ ${supplier.name} đã giao ngay ${qty} ${prod.name} vào Kho dự trữ (-$${cost}).`);
      this.spawnSupplyTruckVisual(`+${qty} ${prod.name}`);
      this.renderAllUI();
      return;
    }

    let arriveDay = this.state.day + 1;
    let arriveHour = 8;
    if (supplier.id === 'wholesaler') {
      arriveDay = this.state.day + 2;
      arriveHour = 8;
    } else if (supplier.id === 'fast247') {
      arriveDay = this.getGameHour() < 12 ? this.state.day : this.state.day + 1;
      arriveHour = 14;
    }

    this.state.pendingDeliveries.push({
      productId,
      qty,
      supplierId: supplier.id,
      arriveDay,
      arriveHour,
      delayChecked: false
    });

    const timeStr = `${String(arriveHour).padStart(2, '0')}:00 Ngày ${arriveDay}`;
    this.log(`🛒 Đặt ${qty} ${prod.name} tại ${supplier.name} (-$${cost}). Dự kiến về Kho dự trữ lúc ${timeStr}.`);
    this.renderAllUI();
  }

  processDueDeliveries() {
    if (this.state.pendingDeliveries.length === 0) return false;
    const currentHour = this.getGameHour();
    const remaining = [];
    let changed = false;

    for (const del of this.state.pendingDeliveries) {
      const isDue = del.arriveDay < this.state.day ||
        (del.arriveDay === this.state.day && currentHour >= del.arriveHour);

      if (!isDue) {
        remaining.push(del);
        continue;
      }

      const prod = PRODUCTS.find((p) => p.id === del.productId);
      const supplier = SUPPLIERS.find((s) => s.id === del.supplierId);

      // Kiểm tra 10% giao trễ 1 ngày cho Nhà A và Nhà B
      if (!del.delayChecked && supplier && supplier.delayChance > 0) {
        del.delayChecked = true;
        if (Math.random() < supplier.delayChance) {
          del.arriveDay += 1;
          this.log(`⚠️ Nhà cung cấp ${supplier.name} giao trễ 1 ngày (${prod ? prod.name : del.productId} ×${del.qty} → Ngày ${del.arriveDay}).`);
          remaining.push(del);
          changed = true;
          continue;
        }
      }

      // Giao vào KHO DỰ TRỮ (reserve)
      if (prod) {
        this.state.reserve[del.productId].push({ qty: del.qty, daysLeft: prod.shelfLife });
        this.log(`🚚 ${supplier ? supplier.name : 'Nhà cung cấp'} đã giao ${del.qty} ${prod.name} vào Kho dự trữ.`);
        this.spawnSupplyTruckVisual(`+${del.qty} ${prod.name}`);
      }
      changed = true;
    }

    this.state.pendingDeliveries = remaining;
    return changed;
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

  // ===== NGÂN HÀNG (VAY VỐN & TIẾT KIỆM) =====
  getCreditLimit() {
    const b = GAME_CONFIG.bank;
    return b.baseLimit + this.state.reputation * b.repMultiplier + (this.state.level - 1) * b.levelMultiplier;
  }

  getMinDailyRepayment() {
    const loan = this.state.bank.loan;
    if (loan <= 0) return 0;
    const b = GAME_CONFIG.bank;
    return Math.min(loan, Math.max(b.minRepayFlat, Math.round(loan * b.minRepayRate)));
  }

  borrowMoney(rawAmount) {
    const amount = Math.floor(Number(rawAmount));
    const maxBorrow = Math.max(0, this.getCreditLimit() - this.state.bank.loan);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền vay hợp lệ (> 0).');
      return;
    }
    if (maxBorrow <= 0) {
      alert('Bạn đã chạm hạn mức vay tối đa.');
      return;
    }
    const actual = Math.min(amount, maxBorrow);
    this.state.money += actual;
    this.state.bank.loan += actual;
    this.log(`🏦 Đã vay ngân hàng $${actual.toLocaleString()} (Dư nợ: $${this.state.bank.loan.toLocaleString()}).`);
    this.sceneRenderer.addFloatingText(980, 145, `+$${actual.toLocaleString()}`, '#7c3aed');
    this.saveGame();
    this.renderAllUI();
  }

  repayLoan(rawAmount) {
    const amount = Math.floor(Number(rawAmount));
    if (this.state.bank.loan <= 0) {
      alert('Bạn hiện không có dư nợ vay.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền trả nợ hợp lệ (> 0).');
      return;
    }
    const maxPay = Math.min(this.state.money, this.state.bank.loan);
    if (maxPay <= 0) {
      alert('Không đủ tiền mặt để trả nợ.');
      return;
    }
    const actual = Math.min(amount, maxPay);
    this.state.money -= actual;
    this.state.bank.loan -= actual;
    this.log(`🏦 Đã trả nợ ngân hàng $${actual.toLocaleString()} (Còn nợ: $${this.state.bank.loan.toLocaleString()}).`);
    this.saveGame();
    this.renderAllUI();
  }

  depositSavings(rawAmount) {
    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền gửi hợp lệ (> 0).');
      return;
    }
    if (amount > this.state.money) {
      alert(`Không đủ tiền mặt (hiện có $${this.state.money.toLocaleString()}).`);
      return;
    }
    this.state.money -= amount;
    this.state.bank.savings += amount;
    this.log(`🐷 Đã gửi tiết kiệm $${amount.toLocaleString()} (Số dư TK: $${this.state.bank.savings.toLocaleString()}).`);
    this.saveGame();
    this.renderAllUI();
  }

  withdrawSavings(rawAmount) {
    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền rút hợp lệ (> 0).');
      return;
    }
    if (amount > this.state.bank.savings) {
      alert(`Số dư tiết kiệm không đủ (hiện có $${this.state.bank.savings.toLocaleString()}).`);
      return;
    }
    this.state.bank.savings -= amount;
    this.state.money += amount;
    this.log(`🐷 Đã rút tiết kiệm $${amount.toLocaleString()} (Còn lại: $${this.state.bank.savings.toLocaleString()}).`);
    this.saveGame();
    this.renderAllUI();
  }

  // ===== PHỐI XE & BẢN ĐỒ =====
  dispatchSelectedOrders() {
    const vehCfg = VEHICLE_TYPES[this.selectedVehicleType];
    if (this.state.fleet[this.selectedVehicleType] <= 0) {
      this.log(`⚠️ Bạn chưa sở hữu ${vehCfg.name}. Mua ở Văn phòng / Nhân viên.`);
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

    const startX = this.selectedVehicleType === 'bike' ? 994 : 1086;
    const startY = this.selectedVehicleType === 'bike' ? 392 : 346;

    const vehEntity = new VehicleEntity({
      type: this.selectedVehicleType,
      x: startX,
      y: startY,
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
    this.sceneRenderer.addFloatingText(1030, 315, `+$${totalEarned} ⭐${avgStar}`, '#15803d');
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

  // ===== TỔNG KẾT NGÀY, LÃI NGÂN HÀNG, HSD KỆ + RESERVE & PHÁ SẢN HOÀN THIỆN =====
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

    // Trừ HSD cho cả KỆ (inventory) và KHO DỰ TRỮ (reserve)
    let expiredCount = 0;
    const decayBatches = (batches) => {
      const next = [];
      for (const batch of batches) {
        batch.daysLeft -= 1;
        if (batch.daysLeft <= 0) {
          expiredCount += batch.qty;
        } else {
          next.push(batch);
        }
      }
      return next;
    };
    for (const prod of PRODUCTS) {
      if (prod.shelfLife !== null) {
        this.state.inventory[prod.id] = decayBatches(this.state.inventory[prod.id] || []);
        this.state.reserve[prod.id] = decayBatches(this.state.reserve[prod.id] || []);
      }
    }
    this.state.dayStats.expiredItems = expiredCount;

    // 1. Cộng lãi tiết kiệm (0.2%/ngày)
    const savingsInterest = Math.round(this.state.bank.savings * GAME_CONFIG.bank.savingsInterestRate);
    this.state.money += savingsInterest;

    // 2. Kiểm tra chi phí cố định & vay khẩn cấp tự động
    let emergencyLoan = 0;
    if (this.state.money < fixedTotal) {
      const shortfall = fixedTotal - this.state.money;
      const remainingLimit = Math.max(0, this.getCreditLimit() - this.state.bank.loan);
      const canBorrow = Math.min(shortfall, remainingLimit);

      if (this.state.money + canBorrow < fixedTotal) {
        // PHÁ SẢN — KHÔNG XÓA SAVE!
        this.bankrupt = true;
        document.getElementById('bankrupt-body').innerHTML = `
          <p>Cuối Ngày ${this.state.day}, bạn có <strong>$${this.state.money.toLocaleString()}</strong> (hạn mức vay còn lại <strong>$${remainingLimit.toLocaleString()}</strong>) nhưng chi phí cố định bắt buộc là <strong>$${fixedTotal.toLocaleString()}</strong> (Thuê kho $${rent} + Điện nước $${utilities} + Bảo hiểm $${insurance}).</p>
          <p>Ngay cả khi vay khẩn cấp tối đa, trung tâm vẫn không đủ thanh toán chi phí cố định.</p>
          <p><em>Dữ liệu lưu gần nhất của bạn vẫn được giữ nguyên.</em></p>
        `;
        document.getElementById('bankrupt-modal').classList.remove('hidden');
        return;
      }

      emergencyLoan = canBorrow;
      this.state.bank.loan += emergencyLoan;
      this.state.money += emergencyLoan;
      this.log(`🏦 Ngân hàng tự cho vay khẩn cấp $${emergencyLoan.toLocaleString()} để trả chi phí cố định.`);
    }

    // 3. Tính lãi vay (1%/ngày) và trừ chi phí cố định + lương + lãi vay
    const loanInterest = Math.round(this.state.bank.loan * GAME_CONFIG.bank.loanInterestRate);
    const totalMandatory = fixedTotal + wages + loanInterest;
    this.state.money -= totalMandatory;
    if (this.state.money < 0) this.state.money = 0;

    // 4. Trả nợ tối thiểu: max($50, 5% dư nợ) nếu đủ tiền, không đủ thì hoãn sang hôm sau
    let actualMinRepay = 0;
    let deferredMinRepay = 0;
    if (this.state.bank.loan > 0) {
      const reqMinRepay = this.getMinDailyRepayment();
      if (this.state.money >= reqMinRepay) {
        this.state.money -= reqMinRepay;
        this.state.bank.loan -= reqMinRepay;
        actualMinRepay = reqMinRepay;
      } else {
        deferredMinRepay = reqMinRepay;
        this.log(`⚠️ Không đủ tiền trả nợ tối thiểu ($${reqMinRepay}) — hoãn sang ngày mai.`);
      }
    }

    const avgStar = this.state.dayStats.ratings.length
      ? (this.state.dayStats.ratings.reduce((a, b) => a + b, 0) / this.state.dayStats.ratings.length).toFixed(1) + '★'
      : '—';

    const emergencyRow = emergencyLoan > 0
      ? `<div class="sum-row"><span>Vay khẩn cấp tự động</span><strong style="color:#d97706">+$${emergencyLoan.toLocaleString()}</strong></div>`
      : '';
    const minRepayText = deferredMinRepay > 0
      ? `<span style="color:#c2410c">Hoãn ($${deferredMinRepay.toLocaleString()})</span>`
      : `<span>-$${actualMinRepay.toLocaleString()}</span>`;

    document.getElementById('sum-day').textContent = this.state.day;
    document.getElementById('summary-body').innerHTML = `
      <div class="sum-row"><span>Đơn giao thành công / Thất bại</span><strong>${this.state.dayStats.deliveredCount} / ${this.state.dayStats.failedCount}</strong></div>
      <div class="sum-row"><span>Đánh giá trung bình</span><strong>${avgStar}</strong></div>
      <div class="sum-row"><span>Doanh thu giao hàng</span><strong style="color:#15803d">+$${this.state.dayStats.revenue.toLocaleString()}</strong></div>
      <div class="sum-row"><span>Tiền nhập hàng & vật tư</span><span>-$${this.state.dayStats.purchaseCost.toLocaleString()}</span></div>
      <div class="sum-row"><span>Tiền xăng vận chuyển</span><span>-$${this.state.dayStats.fuelCost.toLocaleString()}</span></div>
      <div class="sum-row"><span>Lương nhân viên (${this.state.staff.workers} kho, ${this.state.staff.drivers} tài xế)</span><span>-$${wages.toLocaleString()}</span></div>
      <div class="sum-row"><span>Thuê kho ($50) + Điện nước ($20) + Bảo hiểm (${totalVehicles} xe × $10)</span><strong style="color:#c2410c">-$${fixedTotal.toLocaleString()}</strong></div>
      ${emergencyRow}
      <div class="sum-row"><span>Lãi tiết kiệm (0.2%/ngày)</span><strong style="color:#15803d">+$${savingsInterest.toLocaleString()}</strong></div>
      <div class="sum-row"><span>Lãi vay (1%/ngày)</span><span style="color:#c2410c">-$${loanInterest.toLocaleString()}</span></div>
      <div class="sum-row"><span>Trả nợ tối thiểu</span>${minRepayText}</div>
      <div class="sum-row"><span>Hàng hết hạn bị hủy (kệ + dự trữ)</span><strong>${expiredCount} sp</strong></div>
      <div class="sum-row"><span>Số dư còn lại</span><strong style="color:#0f766e">$${this.state.money.toLocaleString()}</strong></div>
    `;

    this.updateHeaderStats();
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

    this.processDueDeliveries();

    this.summaryOpen = false;
    document.getElementById('summary-modal').classList.add('hidden');
    this.spawnOrder();
    this.saveGame(`bắt đầu Ngày ${this.state.day}`);
    this.renderAllUI();
  }

  // ===== TÁCH RIÊNG VÒNG LẶP LOGIC GAME VỚI VÒNG LẶP VẼ 60FPS =====
  updateLogic(dt) {
    if (this.paused || this.summaryOpen || this.bankrupt) return;

    this.state.dayElapsed += dt;
    if (this.state.dayElapsed >= GAME_CONFIG.dayDurationSec) {
      this.openDaySummary();
      return;
    }

    let structuralDirty = false;

    if (this.processDueDeliveries()) {
      structuralDirty = true;
    }

    const maxActiveOrders = this.state.level <= 2 ? 3 : this.state.level <= 4 ? 4 : 5;
    this.orderSpawnTimer += dt;
    if (this.orderSpawnTimer >= 36) {
      this.orderSpawnTimer = 0;
      if (this.state.orders.length < maxActiveOrders) this.spawnOrder();
    }

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
        structuralDirty = true;
      }
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
            this.sceneRenderer.addFloatingText(700, 295, `📦 Xong #${order.id}`, '#2563eb');
          }
          table.orderId = null;
          table.progress = 0;
          structuralDirty = true;
        }
      }
    }

    // Chỉ cập nhật các con số thời gian/tiến độ thay đổi (KHÔNG vẽ lại toàn bộ DOM mỗi giây)
    this.liveTickTimer += dt;
    if (this.liveTickTimer >= 0.25) {
      this.liveTickTimer = 0;
      this.updateLiveDOM();
    }

    if (structuralDirty) {
      this.renderAllUI();
    }
  }

  // Vòng lặp chuyển động mượt 60fps trên canvas (chạy mọi khung hình)
  updateAnimations(rawDt) {
    this.sceneRenderer.updateEffects(rawDt);

    if (this.paused || this.summaryOpen || this.bankrupt) return;

    const animDt = rawDt * this.speedMultiplier;
    const anyPacking = this.state.packingTables.some((t) => t.orderId !== null);
    this.conveyor.speedFactor = anyPacking ? 1.45 : 0.85;
    this.conveyor.update(animDt);

    this.forklift.update(animDt);
    for (const w of this.workers) w.update(animDt);
    for (const d of this.drivers) d.update(animDt);

    for (const rt of this.receivingTrucks) rt.update(animDt);
    this.receivingTrucks = this.receivingTrucks.filter((rt) => !rt.done);

    for (const v of this.activeVehicles) v.update(animDt);
    this.activeVehicles = this.activeVehicles.filter((v) => !v.done);
  }

  drawScene() {
    this.sceneRenderer.render(this);
    if (this.drawerOpen && this.activeTabId === 'tab-dispatch' && !this.officeCombinedMode) {
      this.drawRouteMap();
    }
  }

  drawRouteMap() {
    const ctx = this.routeMapCtx;
    const w = this.routeMapCanvas.width;
    const h = this.routeMapCanvas.height;

    ctx.fillStyle = '#bfe08e';
    ctx.fillRect(0, 0, w, h);

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

    const boxesImg = this.assets.get('boxes.png');
    if (boxesImg) ctx.drawImage(boxesImg, 24, 82, 54, 54);
    ctx.fillStyle = '#3d220d';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('KHO', 38, 148);

    const houseImg = this.assets.get('city-house.png');
    if (houseImg) ctx.drawImage(houseImg, 170, 26, 62, 62);
    ctx.fillText('Khu 1', 184, 102);

    const shopImg = this.assets.get('city-shop.png');
    const z2Unlocked = this.state.level >= GAME_CONFIG.unlocks.zone2AndRushLevel;
    ctx.save();
    if (!z2Unlocked) ctx.globalAlpha = 0.45;
    if (shopImg) ctx.drawImage(shopImg, 298, 52, 64, 64);
    ctx.restore();
    ctx.fillText(z2Unlocked ? 'Khu 2' : 'Khu 2 (Lv3)', 302, 130);

    this.activeVehicles.forEach((v) => {
      const t = Math.min(1, Math.max(0, v.progress));
      const endX = v.zone && v.zone.id === 'zone2' ? 325 : 198;
      const endY = v.zone && v.zone.id === 'zone2' ? 92 : 70;
      const vx = 55 + (endX - 55) * t;
      const vy = 112 + (endY - 112) * t - Math.sin(t * Math.PI) * 16;
      const spr = this.assets.get(v.frames[v.frameIndex]) || this.assets.get(v.fallbackAsset);
      if (spr) ctx.drawImage(spr, vx - 24, vy - 24, 48, 48);
    });
  }

  // ===== CẬP NHẬT NHẸ CHỈ CÁC PHẦN TỬ THAY ĐỔI (KHÔNG PHÁ NÚT BẤM) =====
  updateLiveDOM() {
    this.updateClockHUD();

    // Cập nhật giờ đếm ngược ngay trên DOM sẵn có (không xóa tạo lại card)
    for (const o of this.state.orders) {
      const secText = `⏱ ${Math.max(0, Math.ceil(o.timeLeft))}s`;
      document.querySelectorAll(`[data-order-timer="${o.id}"]`).forEach((el) => {
        if (el.textContent !== secText) el.textContent = secText;
      });
    }

    // Cập nhật tiến độ bàn đóng gói tại chỗ
    if (this.drawerOpen && this.activeTabId === 'tab-pack') {
      for (const t of this.state.packingTables) {
        if (t.orderId !== null) {
          const pct = Math.min(100, Math.floor(t.progress));
          const fill = document.querySelector(`[data-pack-fill="${t.id}"]`);
          const label = document.querySelector(`[data-pack-label="${t.id}"]`);
          if (fill) fill.style.width = `${pct}%`;
          if (label) label.textContent = `Đang gói Đơn #${t.orderId} (${pct}%)`;
        }
      }
    }

    // Cập nhật tiến độ xe đang giao tại chỗ
    if (this.drawerOpen && this.activeTabId === 'tab-dispatch') {
      this.activeVehicles.forEach((v, idx) => {
        const pct = Math.min(100, Math.floor(v.progress * 100));
        const fill = document.querySelector(`[data-veh-fill="${idx}"]`);
        const txt = document.querySelector(`[data-veh-pct="${idx}"]`);
        if (fill) fill.style.width = `${pct}%`;
        if (txt) txt.textContent = `${pct}%`;
      });
    }
  }

  updateClockHUD() {
    const progress = Math.min(1, this.state.dayElapsed / GAME_CONFIG.dayDurationSec);
    const totalMinutes = Math.floor(8 * 60 + progress * 12 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    const clockStr = `${hh}:${mm}`;
    const phaseStr = progress > 0.78 ? '🌙' : progress > 0.58 ? '🌇' : '☀️';

    if (this.hudCache.clock !== clockStr) {
      this.hudCache.clock = clockStr;
      document.getElementById('stat-clock').textContent = clockStr;
    }
    if (this.hudCache.phase !== phaseStr) {
      this.hudCache.phase = phaseStr;
      document.getElementById('stat-phase').textContent = phaseStr;
    }
  }

  updateHeaderStats() {
    if (this.hudCache.day !== this.state.day) {
      this.hudCache.day = this.state.day;
      document.getElementById('stat-day-label').textContent = `Ngày ${this.state.day}`;
    }
    if (this.hudCache.money !== this.state.money) {
      this.hudCache.money = this.state.money;
      document.getElementById('stat-money').textContent = this.state.money.toLocaleString();
    }
    if (this.hudCache.loan !== this.state.bank.loan) {
      this.hudCache.loan = this.state.bank.loan;
      const debtPill = document.getElementById('hud-debt-pill');
      const debtEl = document.getElementById('stat-debt');
      debtEl.textContent = `$${this.state.bank.loan.toLocaleString()}`;
      debtPill.classList.toggle('debt-active', this.state.bank.loan > 0);
    }
    if (this.hudCache.rep !== this.state.reputation) {
      this.hudCache.rep = this.state.reputation;
      document.getElementById('stat-rep').textContent = this.state.reputation;
    }
    if (this.hudCache.level !== this.state.level) {
      this.hudCache.level = this.state.level;
      document.getElementById('stat-level').textContent = this.state.level;
    }
    const reqXp = GAME_CONFIG.xpPerLevel(this.state.level);
    const xpText = `${this.state.xp}/${reqXp}`;
    const pct = Math.min(100, Math.round((this.state.xp / reqXp) * 100));
    if (this.hudCache.xpText !== xpText) {
      this.hudCache.xpText = xpText;
      document.getElementById('stat-xp').textContent = xpText;
    }
    if (this.hudCache.xpPct !== pct) {
      this.hudCache.xpPct = pct;
      document.getElementById('xp-bar-fill').style.width = `${pct}%`;
    }
  }

  renderVisiblePanel() {
    if (!this.drawerOpen) return;
    if (this.officeCombinedMode) {
      this.renderBank();
      this.renderStaff();
      return;
    }
    switch (this.activeTabId) {
      case 'tab-orders': this.renderOrderStrip(); break;
      case 'tab-pick': this.renderShelves(); break;
      case 'tab-pack': this.renderPacking(); break;
      case 'tab-dispatch':
        this.renderDispatch();
        this.drawRouteMap();
        break;
      case 'tab-supplier': this.renderSupplier(); break;
      case 'tab-staff': this.renderStaff(); break;
      case 'tab-bank': this.renderBank(); break;
    }
  }

  renderAllUI() {
    this.updateClockHUD();
    this.updateHeaderStats();
    this.renderOrderStrip();
    if (this.drawerOpen) {
      this.renderVisiblePanel();
    }
  }

  renderOrderStrip() {
    const strip = document.getElementById('orders-strip');
    const drawerList = document.getElementById('orders-drawer-list');
    document.getElementById('order-count').textContent = this.state.orders.length;
    strip.innerHTML = '';
    if (drawerList) drawerList.innerHTML = '';

    const btnActionText = {
      picking: 'Soạn',
      ready_to_pack: 'Đóng gói',
      packing: 'Đang gói',
      packed: 'Giao hàng',
      delivering: 'Đang giao'
    };

    const targetTabForStatus = {
      picking: 'tab-pick',
      ready_to_pack: 'tab-pack',
      packing: 'tab-pack',
      packed: 'tab-dispatch',
      delivering: 'tab-dispatch'
    };

    for (const o of this.state.orders) {
      const itemsHtml = o.items.map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId);
        const isDone = it.picked >= it.qty;
        const iconSrc = this.assets.getSrc(p.iconAsset);
        return `<span class="item-pill ${isDone ? 'done' : ''}" title="${p.name}"><img class="item-mini-icon" src="${iconSrc}" alt="${p.name}" /> ${it.picked}/${it.qty}</span>`;
      }).join('');

      const card = document.createElement('div');
      card.className = `float-order-card ${o.isRush ? 'rush' : ''} ${this.selectedOrderId === o.id ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="float-order-head">
          <span>Đơn #${o.id}${o.isRush ? ' 🔥' : ''}</span>
          <span data-order-timer="${o.id}">⏱ ${Math.max(0, Math.ceil(o.timeLeft))}s</span>
        </div>
        <div class="float-order-body">
          <div class="float-order-items">${itemsHtml}</div>
          <div class="float-order-right">
            <span class="float-reward">$${o.reward}</span>
            <button class="game-btn btn-teal btn-soan-card">${btnActionText[o.status]}</button>
          </div>
        </div>
      `;
      card.onclick = () => {
        this.selectedOrderId = o.id;
        this.renderOrderStrip();
        if (this.drawerOpen && this.activeTabId === 'tab-pick') this.renderShelves();
      };
      card.querySelector('.btn-soan-card').onclick = (e) => {
        e.stopPropagation();
        this.selectedOrderId = o.id;
        this.openDrawerTab(targetTabForStatus[o.status] || 'tab-pick');
      };
      strip.appendChild(card);

      // Danh sách đơn trong bảng Quầy Đơn hàng
      if (drawerList) {
        const dcard = document.createElement('div');
        dcard.className = `vcard ${o.isRush ? 'rush' : ''}`;
        dcard.innerHTML = `
          <div class="vcard-title">Đơn #${o.id}${o.isRush ? ' 🔥 GẤP' : ''} • <span data-order-timer="${o.id}">⏱ ${Math.max(0, Math.ceil(o.timeLeft))}s</span></div>
          <div class="float-order-items">${itemsHtml}</div>
          <div class="vcard-sub">Thưởng: <strong>$${o.reward}</strong> • +${o.xp} XP</div>
          <button class="game-btn btn-teal">${btnActionText[o.status]}</button>
        `;
        dcard.querySelector('button').onclick = () => {
          this.selectedOrderId = o.id;
          this.openDrawerTab(targetTabForStatus[o.status] || 'tab-pick');
        };
        drawerList.appendChild(dcard);
      }
    }
  }

  // Kho Kệ hàng: Kệ X/12 từng sản phẩm + Kho dự trữ + Bổ sung
  renderShelves() {
    const hint = document.getElementById('pick-hint');
    const selected = this.state.orders.find((o) => o.id === this.selectedOrderId);
    if (!selected) {
      hint.innerHTML = 'Chọn một thẻ đơn hàng phía dưới để bắt đầu soạn hàng bằng cách bấm đúng món trên kệ.';
    } else if (selected.status !== 'picking') {
      hint.innerHTML = `Đang chọn <strong>Đơn #${selected.id}</strong> — đã soạn xong (chuyển sang <strong>Đóng gói</strong> hoặc <strong>Giao hàng</strong>).`;
    } else {
      const needText = selected.items.map((it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId);
        const iconSrc = this.assets.getSrc(p.iconAsset);
        return `<img src="${iconSrc}" alt="${p.name}" style="width:16px;height:16px;object-fit:contain;vertical-align:-3px;" /> ${p.name} (${it.picked}/${it.qty})`;
      }).join(' • ');
      hint.innerHTML = `✅ Đang soạn <strong>Đơn #${selected.id}</strong> — Cần lấy: <strong>${needText}</strong>`;
    }

    const grid = document.getElementById('shelf-grid');
    grid.innerHTML = '';
    const coldUnlocked = this.state.level >= GAME_CONFIG.unlocks.coldShelfLevel;

    for (const p of PRODUCTS) {
      const locked = p.cold && !coldUnlocked;
      const shelfQty = this.getStockCount(p.id);
      const reserveQty = this.getReserveCount(p.id);
      const minHsd = this.getMinShelfLife(p.id);
      const itemIconSrc = this.assets.getSrc(p.iconAsset);

      let hsdClass = 'hsd-none';
      let hsdText = 'Không HSD';
      if (minHsd !== null) {
        if (minHsd <= 1) {
          hsdClass = 'hsd-danger';
          hsdText = `⚠️ Sắp hết hạn! (${minHsd} ngày)`;
        } else if (minHsd <= 2) {
          hsdClass = 'hsd-warn';
          hsdText = `HSD gần nhất: ${minHsd} ngày`;
        } else {
          hsdClass = 'hsd-ok';
          hsdText = `HSD gần nhất: ${minHsd} ngày`;
        }
      } else if (p.shelfLife) {
        hsdText = 'Hết hàng';
      }

      const card = document.createElement('div');
      card.className = `vcard ${p.cold ? 'cold' : ''} ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${itemIconSrc}" alt="${p.name}" />
          <div class="vcard-info">
            <div class="vcard-title">${p.name}</div>
            <div class="vcard-sub">Kệ <strong>${shelfQty}/${GAME_CONFIG.shelfCapacity}</strong> • Dự trữ <strong>${reserveQty}</strong></div>
            <span class="hsd-tag ${hsdClass}">${hsdText}</span>
          </div>
        </div>
        <div class="card-btn-row">
          <button class="game-btn btn-teal btn-pick-one" ${locked || shelfQty <= 0 ? 'disabled' : ''}>${locked ? '🔒 Cấp 2' : '✋ Soạn 1'}</button>
          <button class="game-btn btn-orange btn-replenish-one" ${locked ? 'disabled' : ''}>📥 Châm hàng</button>
        </div>
      `;
      card.querySelector('.btn-pick-one').onclick = () => this.pickFromShelf(p.id);
      card.querySelector('.btn-replenish-one').onclick = () => this.replenishShelf(p.id);
      grid.appendChild(card);
    }
  }

  // Khu Đóng gói: Vật tư + Danh sách đơn chờ đóng gói + 2 bàn đóng gói
  renderPacking() {
    const boxSrc = this.assets.getSrc('boxes.png');
    const readyOrders = this.state.orders.filter((o) => o.status === 'ready_to_pack');
    document.getElementById('supplies-bar').innerHTML = `
      <div class="sup-chip"><img src="${boxSrc}" alt="" /> Thùng carton: <strong>${this.state.supplies.box}</strong></div>
      <div class="sup-chip"><img src="${boxSrc}" alt="" /> Băng dính: <strong>${this.state.supplies.tape}</strong></div>
      <div class="sup-chip"><img src="${this.assets.getSrc('shelf-cold.png')}" alt="" /> Túi giữ lạnh: <strong>${this.state.supplies.coldBag}</strong></div>
      <div class="sup-chip">📋 Đơn chờ đóng gói: <strong>${readyOrders.length}</strong></div>
    `;

    const readyList = document.getElementById('ready-to-pack-list');
    if (readyList) {
      readyList.innerHTML = '';
      if (readyOrders.length === 0) {
        readyList.innerHTML = '<div class="vcard-sub">Chưa có đơn chờ đóng gói (hãy soạn xong đơn ở Kho Kệ hàng trước).</div>';
      } else {
        for (const o of readyOrders) {
          const pill = document.createElement('div');
          pill.className = 'ready-pack-pill';
          pill.innerHTML = `📦 Đơn #${o.id}${o.needsCold ? ' ❄️' : ''} • $${o.reward} • <span data-order-timer="${o.id}">⏱ ${Math.max(0, Math.ceil(o.timeLeft))}s</span>`;
          readyList.appendChild(pill);
        }
      }
    }

    const grid = document.getElementById('packing-tables');
    grid.innerHTML = '';
    const tableSrc = this.assets.getSrc('packing-table.png');

    for (const t of this.state.packingTables) {
      const pct = t.orderId ? Math.min(100, Math.floor(t.progress)) : 0;
      const card = document.createElement('div');
      card.className = 'vcard';
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${t.orderId ? boxSrc : tableSrc}" alt="" />
          <div class="vcard-info">
            <div class="vcard-title">Bàn #${t.id}</div>
            <div class="vcard-sub" data-pack-label="${t.id}">${t.orderId ? `Đang gói Đơn #${t.orderId} (${pct}%)` : 'Trống'}</div>
          </div>
        </div>
        <div class="mini-prog-track"><div class="mini-prog-fill" data-pack-fill="${t.id}" style="width:${pct}%"></div></div>
        <button class="game-btn btn-orange" ${t.orderId ? 'disabled' : ''}>📦 Đóng gói 1 đơn</button>
      `;
      card.querySelector('button').onclick = () => this.assignToPackingTable(t.id);
      grid.appendChild(card);
    }
  }

  // Khu Giao hàng: Đơn đã đóng gói + Xe đang giao + Chọn xe + Bản đồ tuyến
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
          <span data-order-timer="${o.id}">⏱ ${Math.ceil(o.timeLeft)}s</span>
        `;
        row.querySelector('input').onchange = (e) => {
          if (e.target.checked) this.selectedPackedIds.add(o.id);
          else this.selectedPackedIds.delete(o.id);
        };
        packedList.appendChild(row);
      }
    }

    // Danh sách xe nào đang giao đơn nào
    const activeList = document.getElementById('active-deliveries-list');
    if (activeList) {
      activeList.innerHTML = '';
      if (this.activeVehicles.length === 0) {
        activeList.innerHTML = '<div class="vcard-sub">Hiện chưa có xe nào đang đi giao.</div>';
      } else {
        this.activeVehicles.forEach((v, idx) => {
          const cfg = VEHICLE_TYPES[v.type];
          const pct = Math.min(100, Math.floor(v.progress * 100));
          const orderIds = v.orders.map((o) => `#${o.id}`).join(', ');
          const div = document.createElement('div');
          div.className = 'active-veh-tile';
          div.innerHTML = `
            <div class="active-veh-top">
              <span style="display:flex;align-items:center;gap:6px;">
                <img src="${this.assets.getSrc(cfg.idleAsset)}" alt="${cfg.name}" />
                <strong>${cfg.name}</strong> → Đơn ${orderIds} (${v.zone ? v.zone.name.split('—')[0].trim() : 'Khu 1'})
              </span>
              <strong data-veh-pct="${idx}">${pct}%</strong>
            </div>
            <div class="mini-prog-track"><div class="mini-prog-fill" data-veh-fill="${idx}" style="width:${pct}%"></div></div>
          `;
          activeList.appendChild(div);
        });
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
        div.onclick = () => {
          this.selectedZoneId = z.id;
          this.renderDispatch();
          this.drawRouteMap();
        };
      }
      zoneBox.appendChild(div);
    }
  }

  // Khu Nhập hàng: 3 Nhà cung cấp + chiết khấu + vật tư
  renderSupplier() {
    const selBox = document.getElementById('supplier-selector');
    selBox.innerHTML = '';
    for (const s of SUPPLIERS) {
      const card = document.createElement('div');
      card.className = `sup-tab-card ${this.selectedSupplierId === s.id ? 'active' : ''}`;
      card.onclick = () => { this.selectedSupplierId = s.id; this.renderSupplier(); };
      card.innerHTML = `
        <div class="sup-tab-name">${s.code}: ${s.name}</div>
        <div class="sup-tab-badge">${s.badge}</div>
        <div class="sup-tab-desc">${s.desc}</div>
      `;
      selBox.appendChild(card);
    }

    const activeSupplier = SUPPLIERS.find((s) => s.id === this.selectedSupplierId) || SUPPLIERS[1];
    const pGrid = document.getElementById('supplier-products');
    pGrid.innerHTML = '';

    for (const p of PRODUCTS) {
      const coldLocked = p.cold && this.state.level < GAME_CONFIG.unlocks.coldShelfLevel;
      const notSoldHere = !activeSupplier.products.includes(p.id);
      const locked = coldLocked || notSoldHere;
      const rackSrc = this.assets.getSrc(p.cold ? 'shelf-cold.png' : 'shelf-rack.png');
      const itemIconSrc = this.assets.getSrc(p.iconAsset);
      const hsdClass = p.shelfLife === null ? 'hsd-none' : p.shelfLife <= 3 ? 'hsd-warn' : 'hsd-ok';

      const unitPrice = this.getSupplierUnitPrice(p, activeSupplier);
      const cost5 = this.getSupplierOrderCost(p, activeSupplier, 5);
      const cost10 = this.getSupplierOrderCost(p, activeSupplier, 10);
      const cost20 = this.getSupplierOrderCost(p, activeSupplier, 20);

      const compareText = SUPPLIERS
        .filter((s) => s.id !== activeSupplier.id)
        .map((s) => {
          if (!s.products.includes(p.id)) return `${s.code}: Không bán`;
          return `${s.code}: $${this.getSupplierUnitPrice(p, s)}/sp`;
        })
        .join(' • ');

      const card = document.createElement('div');
      card.className = `vcard ${p.cold ? 'cold' : ''} ${locked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="vcard-head">
          <img class="vcard-thumb" src="${rackSrc}" alt="${p.name}" />
          <div class="vcard-info">
            <div class="vcard-title"><img class="inline-prod-icon" src="${itemIconSrc}" alt="${p.name}" />${p.name} ${notSoldHere ? '' : `($${unitPrice}/sp)`}</div>
            <span class="hsd-tag ${hsdClass}">${p.shelfLife ? `HSD: ${p.shelfLife} ngày` : 'Không hết hạn'}</span>
          </div>
        </div>
        <div class="price-compare">So sánh: ${compareText}</div>
        ${notSoldHere
          ? `<div class="vcard-sub" style="color:#b91c1c;font-weight:700;">Không bán tại ${activeSupplier.name}</div>`
          : coldLocked
            ? `<button class="game-btn btn-teal" disabled>🔒 Mở Kệ lạnh ở Cấp 2</button>`
            : `<div class="sup-qty-row">
                <button class="game-btn btn-teal sup-qty-btn" data-qty="5">5 sp<br/>$${cost5}</button>
                <button class="game-btn btn-teal sup-qty-btn" data-qty="10">10 (-5%)<br/>$${cost10}</button>
                <button class="game-btn btn-orange sup-qty-btn" data-qty="20">20 (-10%)<br/>$${cost20}</button>
              </div>`
        }
      `;
      card.querySelectorAll('.sup-qty-btn').forEach((btn) => {
        btn.onclick = () => this.buyProductFromSupplier(p.id, Number(btn.dataset.qty), activeSupplier.id);
      });
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
      pend.innerHTML = `<img src="${truckSrc}" alt="Xe hàng" /> <span>Chưa có chuyến hàng nào đang giao</span>`;
    } else {
      const summary = this.state.pendingDeliveries.map((d) => {
        const p = PRODUCTS.find((x) => x.id === d.productId);
        const s = SUPPLIERS.find((x) => x.id === d.supplierId);
        const hh = String(d.arriveHour || 8).padStart(2, '0');
        return `${s ? s.code : 'NCC'}: ${p ? p.name : d.productId} ×${d.qty} (Ngày ${d.arriveDay} ${hh}:00)`;
      }).join(' | ');
      pend.innerHTML = `<img src="${truckSrc}" alt="Xe hàng" /> <span>Đang giao: ${summary}</span>`;
    }
  }

  // Ngân hàng
  renderBank() {
    const limit = this.getCreditLimit();
    const loan = this.state.bank.loan;
    const avail = Math.max(0, limit - loan);
    const minRepay = this.getMinDailyRepayment();
    const savings = this.state.bank.savings;
    const estSavingsInt = Math.round(savings * GAME_CONFIG.bank.savingsInterestRate);

    document.getElementById('bank-limit').textContent = `$${limit.toLocaleString()}`;
    document.getElementById('bank-loan').textContent = `$${loan.toLocaleString()}`;
    document.getElementById('bank-avail').textContent = `$${avail.toLocaleString()}`;
    document.getElementById('bank-min-repay').textContent = `$${minRepay.toLocaleString()}`;
    document.getElementById('bank-savings').textContent = `$${savings.toLocaleString()}`;
    document.getElementById('bank-savings-est').textContent = `+$${estSavingsInt.toLocaleString()}`;
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
    if (!list) return;
    list.innerHTML = '';
    let loadedCount = 0;
    let loadingCount = 0;
    let missingCount = 0;

    for (const [name, state] of this.assets.status.entries()) {
      const isLoaded = state === 'loaded' || this.assets.images.has(name);
      const isLoading = !isLoaded && state === 'loading';
      if (isLoaded) loadedCount++;
      else if (isLoading) loadingCount++;
      else missingCount++;

      const div = document.createElement('div');
      div.className = 'asset-item';
      const cls = isLoaded ? 'ok' : isLoading ? 'loading-tag' : 'missing';
      const txt = isLoaded ? '✓ Có' : isLoading ? 'Đang tải...' : 'Thiếu';
      div.innerHTML = `<span>${name}</span><span class="${cls}">${txt}</span>`;
      list.appendChild(div);
    }

    const modalCard = list.closest('.modal-card');
    if (modalCard) {
      let bar = modalCard.querySelector('.asset-summary-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'asset-summary-bar';
        modalCard.insertBefore(bar, list);
      }
      bar.innerHTML = `
        <span class="ok">✓ Đã nạp: ${loadedCount}</span>
        <span class="loading-tag">⏳ Đang tải: ${loadingCount}</span>
        <span class="missing">⚠️ Thiếu: ${missingCount}</span>
      `;
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

  // Vòng lặp chính 60fps tách bạch logic và vẽ/chuyển động
  loop(timestamp) {
    const rawDt = Math.min(Math.max((timestamp - this.lastTime) / 1000, 0), 0.05);
    this.lastTime = timestamp;

    this.fpsStats.frames += 1;
    if (timestamp - this.fpsStats.lastReport >= 1000) {
      this.fpsStats.fps = Math.round((this.fpsStats.frames * 1000) / (timestamp - this.fpsStats.lastReport));
      this.fpsStats.frames = 0;
      this.fpsStats.lastReport = timestamp;
    }

    this.updateLogic(rawDt * this.speedMultiplier);
    this.updateAnimations(rawDt);
    this.drawScene();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const game = new LogisticCenterGame();
  window.__game = game;
  game.init();
});

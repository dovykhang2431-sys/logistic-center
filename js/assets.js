/**
 * AssetManager — Quản lý 13 asset gốc + 7 ảnh nền/khu mới v1.4 + 6 icon sản phẩm + 26 khung hình chuyển động (tổng 52 asset)
 * 7 ảnh PNG RGB đục mới (hub-scene.png + 6 zone-*.png) dùng nguyên bản full-bleed, KHÔNG lọc nền trắng.
 */
const OPAQUE_SCENE_ASSETS = new Set([
  'hub-scene.png',
  'zone-nhap-hang.png',
  'zone-kho.png',
  'zone-dong-goi.png',
  'zone-giao-hang.png',
  'zone-van-phong.png',
  'zone-quay-don.png'
]);

const ASSET_MANIFEST = {
  // 7 ảnh nền hub & đại diện 6 khu vực mới (v1.4)
  hubAndZones: [
    'hub-scene.png',
    'zone-nhap-hang.png',
    'zone-kho.png',
    'zone-dong-goi.png',
    'zone-giao-hang.png',
    'zone-van-phong.png',
    'zone-quay-don.png'
  ],
  // Ảnh cảnh chính cần hiển thị ngay lập tức
  primaryScene: [
    'hub-scene.png',
    'zone-nhap-hang.png',
    'zone-kho.png',
    'zone-dong-goi.png',
    'zone-giao-hang.png',
    'zone-van-phong.png',
    'zone-quay-don.png',
    'shelf-rack.png',
    'shelf-cold.png',
    'conveyor.png',
    'packing-table.png',
    'forklift.png',
    'boxes.png',
    'truck-small.png',
    'truck-large.png',
    'bike-delivery.png',
    'worker-warehouse.png',
    'driver.png'
  ],
  // 13 asset gốc (giữ nguyên tên file cũ)
  base: [
    'shelf-rack.png',
    'shelf-cold.png',
    'conveyor.png',
    'packing-table.png',
    'forklift.png',
    'boxes.png',
    'truck-small.png',
    'truck-large.png',
    'bike-delivery.png',
    'worker-warehouse.png',
    'driver.png',
    'city-house.png',
    'city-shop.png'
  ],
  // 6 icon sản phẩm
  productIcons: [
    'item-food.png',
    'item-electronics.png',
    'item-clothing.png',
    'item-beverage.png',
    'item-household.png',
    'item-frozen.png'
  ],
  // 26 khung hình chuyển động (tải nền sau khi cảnh chính đã lên)
  animations: {
    workerWalk: ['worker-walk-1.png', 'worker-walk-2.png', 'worker-walk-3.png', 'worker-walk-4.png'],
    workerCarry: ['worker-carry-1.png', 'worker-carry-2.png'],
    driverWalk: ['driver-walk-1.png', 'driver-walk-2.png', 'driver-walk-3.png', 'driver-walk-4.png'],
    bike: ['bike-1.png', 'bike-2.png', 'bike-3.png'],
    truckSmall: ['truck-small-1.png', 'truck-small-2.png', 'truck-small-3.png'],
    truckLarge: ['truck-large-1.png', 'truck-large-2.png', 'truck-large-3.png'],
    forklift: ['forklift-1.png', 'forklift-2.png', 'forklift-3.png'],
    conveyor: ['conveyor-1.png', 'conveyor-2.png', 'conveyor-3.png', 'conveyor-4.png']
  }
};

class AssetManager {
  constructor() {
    this.images = new Map();
    this.dataUrls = new Map();
    this.status = new Map(); // 'loading' | 'loaded' | 'missing'
    this.inflight = new Map();
    for (const file of this.getAllFilenames()) {
      this.status.set(file, 'loading');
    }
  }

  getAllFilenames() {
    const animFiles = Object.values(ASSET_MANIFEST.animations).flat();
    return [...new Set([...ASSET_MANIFEST.hubAndZones, ...ASSET_MANIFEST.base, ...ASSET_MANIFEST.productIcons, ...animFiles])];
  }

  getPrimaryFilenames() {
    return [...new Set([...ASSET_MANIFEST.primaryScene, ...ASSET_MANIFEST.productIcons])];
  }

  getSecondaryFilenames() {
    const primarySet = new Set(this.getPrimaryFilenames());
    return this.getAllFilenames().filter((f) => !primarySet.has(f));
  }

  isLoadingPrimary() {
    for (const file of ASSET_MANIFEST.primaryScene) {
      if (this.status.get(file) === 'loading') return true;
    }
    return false;
  }

  loadBatch(filenames, onProgress = null, timeoutMs = 4000) {
    return Promise.all(
      filenames.map((file) =>
        this.loadOne(file, timeoutMs).then((ok) => {
          if (onProgress) onProgress(file, ok);
          return ok;
        })
      )
    );
  }

  loadPrimary(onProgress = null) {
    return this.loadBatch(this.getPrimaryFilenames(), onProgress, 3500);
  }

  loadSecondary(onProgress = null) {
    return this.loadBatch(this.getSecondaryFilenames(), onProgress, 5000);
  }

  loadOne(filename, timeoutMs = 4000) {
    if (this.status.get(filename) === 'loaded' && this.images.has(filename)) {
      return Promise.resolve(true);
    }
    if (this.inflight.has(filename)) {
      return this.inflight.get(filename);
    }

    const promise = new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.inflight.delete(filename);
        resolve(ok);
      };

      const timer = setTimeout(() => {
        if (this.status.get(filename) === 'loading') {
          this.status.set(filename, 'missing');
        }
        done(false);
      }, timeoutMs);

      const resolvedUrl = new URL(`assets/${filename}`, window.location.href).href;
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          // 7 ảnh hub/zone là PNG RGB đục dùng full-bleed, KHÔNG cắt nền trắng
          const cleaned = OPAQUE_SCENE_ASSETS.has(filename) ? img : this.cleanIfOpaqueWhite(img);
          this.images.set(filename, cleaned);
          this.dataUrls.set(filename, resolvedUrl);
          this.status.set(filename, 'loaded');
          done(true);
        } else {
          this.status.set(filename, 'missing');
          done(false);
        }
      };
      img.onerror = () => {
        this.status.set(filename, 'missing');
        done(false);
      };
      img.src = resolvedUrl;
    });

    this.inflight.set(filename, promise);
    return promise;
  }

  cleanIfOpaqueWhite(img) {
    try {
      const c = document.createElement('canvas');
      c.width = Math.min(8, img.naturalWidth);
      c.height = Math.min(8, img.naturalHeight);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, 1, 1).data;
      // Nếu góc ảnh đã trong suốt (alpha < 250) thì giữ nguyên ảnh gốc để không đục lỗ vùng sáng/trắng
      if (px[3] < 250 || px[0] < 245 || px[1] < 245 || px[2] < 245) {
        return img;
      }
      const full = document.createElement('canvas');
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      const fctx = full.getContext('2d');
      fctx.drawImage(img, 0, 0);
      const imgData = fctx.getImageData(0, 0, full.width, full.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) {
          d[i + 3] = 0;
        }
      }
      fctx.putImageData(imgData, 0, 0);
      return full;
    } catch (e) {
      return img;
    }
  }

  get(filename) {
    return this.images.get(filename) || null;
  }

  getSrc(filename) {
    return this.dataUrls.get(filename) || `assets/${filename}`;
  }
}

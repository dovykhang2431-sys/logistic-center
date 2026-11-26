/**
 * AssetManager — Quản lý đúng 13 asset gốc + 26 khung hình chuyển động trong thư mục assets/
 * Tự động tách nền trắng (chroma-key) để sprite hiển thị mượt trên canvas và UI.
 * Tải bất đồng bộ kèm timeout 5s để vòng lặp game chạy ngay lập tức.
 */
const ASSET_MANIFEST = {
  // 13 asset gốc
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
  // 26 khung hình chuyển động
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
    this.status = new Map();
    for (const file of this.getAllFilenames()) {
      this.status.set(file, 'loading');
    }
  }

  getAllFilenames() {
    const animFiles = Object.values(ASSET_MANIFEST.animations).flat();
    return [...ASSET_MANIFEST.base, ...animFiles];
  }

  isLoadingAny() {
    for (const val of this.status.values()) {
      if (val === 'loading') return true;
    }
    return false;
  }

  loadAll(onProgress = null) {
    const files = this.getAllFilenames();
    return Promise.all(
      files.map((file) =>
        this.loadOne(file).then(() => {
          if (onProgress) onProgress(file);
        })
      )
    );
  }

  loadOne(filename, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        if (this.status.get(filename) === 'loading') {
          this.status.set(filename, false);
        }
        done();
      }, timeoutMs);

      const img = new Image();
      img.onload = () => {
        const cleaned = this.removeWhiteBackground(img);
        this.images.set(filename, cleaned);
        try {
          if (cleaned instanceof HTMLCanvasElement) {
            this.dataUrls.set(filename, cleaned.toDataURL('image/png'));
          } else {
            this.dataUrls.set(filename, `assets/${filename}`);
          }
        } catch (e) {
          this.dataUrls.set(filename, `assets/${filename}`);
        }
        this.status.set(filename, true);
        done();
      };
      img.onerror = () => {
        this.status.set(filename, false);
        done();
      };
      img.src = `assets/${filename}`;
    });
  }

  removeWhiteBackground(img) {
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) {
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return c;
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

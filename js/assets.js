/**
 * AssetManager — Quản lý đúng 13 asset gốc + 26 khung hình chuyển động trong thư mục assets/
 * Tự động tách nền trắng (chroma-key) để sprite hiển thị mượt trên canvas.
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
    this.status = new Map();
  }

  getAllFilenames() {
    const animFiles = Object.values(ASSET_MANIFEST.animations).flat();
    return [...ASSET_MANIFEST.base, ...animFiles];
  }

  async loadAll() {
    const files = this.getAllFilenames();
    await Promise.all(files.map((file) => this.loadOne(file)));
  }

  loadOne(filename) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const cleaned = this.removeWhiteBackground(img);
        this.images.set(filename, cleaned);
        this.status.set(filename, true);
        resolve();
      };
      img.onerror = () => {
        this.status.set(filename, false);
        resolve();
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
}

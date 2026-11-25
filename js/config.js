/**
 * Cấu hình trung tâm cho Logistic Center — Phase 1
 */
const VERSION = "1.0";
const SAVE_KEY = "logistic-center-v1";

const GAME_CONFIG = {
  startingMoney: 2000,
  startingReputation: 50,
  minReputation: 0,
  maxReputation: 100,
  dayDurationSec: 120, // 2 phút thực = 1 ngày làm việc (08:00 -> 20:00)
  fixedCosts: {
    rent: 50,            // Thuê kho $50/ngày
    utilities: 20,       // Điện nước $20/ngày
    insurancePerVehicle: 10 // Bảo hiểm $10/xe/ngày
  },
  staff: {
    workerDailyWage: 35,
    driverDailyWage: 45,
    workerHireCost: 250,
    driverHireCost: 300
  },
  unlocks: {
    coldShelfLevel: 2,   // Kệ lạnh mở khóa cấp 2
    zone2AndRushLevel: 3,// Khu 2 + đơn gấp mở khóa cấp 3
    largeTruckLevel: 8   // Xe tải lớn mở khóa cấp 8
  },
  xpPerLevel: (level) => level * 120
};

// 6 loại hàng hóa + hạn sử dụng (ngày, null = không hết hạn)
const PRODUCTS = [
  { id: 'electronics', name: 'Điện tử', icon: '📱', buyPrice: 45, sellPrice: 80, shelfLife: null, cold: false },
  { id: 'clothing', name: 'Quần áo', icon: '👕', buyPrice: 25, sellPrice: 50, shelfLife: null, cold: false },
  { id: 'household', name: 'Gia dụng', icon: '🏠', buyPrice: 30, sellPrice: 60, shelfLife: null, cold: false },
  { id: 'food', name: 'Thực phẩm', icon: '🥗', buyPrice: 20, sellPrice: 48, shelfLife: 3, cold: false },
  { id: 'beverage', name: 'Đồ uống', icon: '🧃', buyPrice: 15, sellPrice: 36, shelfLife: 5, cold: false },
  { id: 'frozen', name: 'Đông lạnh', icon: '🧊', buyPrice: 35, sellPrice: 78, shelfLife: 7, cold: true }
];

// Vật tư đóng gói
const SUPPLIES = {
  box: { id: 'box', name: 'Thùng carton', icon: '📦', price: 6 },
  tape: { id: 'tape', name: 'Băng dính', icon: '🎞️', price: 3 },
  coldBag: { id: 'coldBag', name: 'Túi giữ lạnh', icon: '❄️', price: 10 }
};

// Phương tiện giao hàng
const VEHICLE_TYPES = {
  bike: {
    id: 'bike', name: 'Xe máy', icon: '🛵',
    capacity: 1, fuelCost: 12, speed: 155, buyCost: 400, unlockLevel: 1,
    idleAsset: 'bike-delivery.png', animKey: 'bike'
  },
  truckSmall: {
    id: 'truckSmall', name: 'Xe tải nhỏ', icon: '🚚',
    capacity: 3, fuelCost: 28, speed: 115, buyCost: 900, unlockLevel: 1,
    idleAsset: 'truck-small.png', animKey: 'truckSmall'
  },
  truckLarge: {
    id: 'truckLarge', name: 'Xe tải lớn', icon: '🚛',
    capacity: 6, fuelCost: 55, speed: 88, buyCost: 1800, unlockLevel: 8,
    idleAsset: 'truck-large.png', animKey: 'truckLarge'
  }
};

// Khu vực giao hàng trên bản đồ phối xe
const ZONES = [
  { id: 'zone1', name: 'Khu 1 — Khu dân cư', asset: 'city-house.png', unlockLevel: 1, distanceMult: 1.0, bonus: 0 },
  { id: 'zone2', name: 'Khu 2 — Phố cửa hàng', asset: 'city-shop.png', unlockLevel: 3, distanceMult: 1.4, bonus: 25 }
];

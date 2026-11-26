/**
 * Cấu hình trung tâm cho Logistic Center — Phase 2 (v1.1)
 */
const VERSION = "1.1";
const SAVE_KEY = "logistic-center-v1";

const GAME_CONFIG = {
  startingMoney: 2000,
  startingReputation: 50,
  minReputation: 0,
  maxReputation: 100,
  dayDurationSec: 240, // 4 phút thực = 1 ngày làm việc (08:00 -> 20:00)
  shelfCapacity: 12,   // Sức chứa mỗi kệ hàng: 12 sp / loại
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
  bank: {
    baseLimit: 5000,
    repMultiplier: 50,
    levelMultiplier: 1000,
    loanInterestRate: 0.01,     // 1%/ngày
    savingsInterestRate: 0.002, // 0.2%/ngày
    minRepayFlat: 50,
    minRepayRate: 0.05          // max($50, 5% dư nợ)
  },
  unlocks: {
    coldShelfLevel: 2,   // Kệ lạnh mở khóa cấp 2
    zone2AndRushLevel: 3,// Khu 2 + đơn gấp mở khóa cấp 3
    largeTruckLevel: 8   // Xe tải lớn mở khóa cấp 8
  },
  xpPerLevel: (level) => level * 120
};

// 6 loại hàng hóa + ảnh icon sản phẩm riêng + hạn sử dụng (ngày, null = không hết hạn)
const PRODUCTS = [
  { id: 'electronics', name: 'Điện tử', icon: '📱', iconAsset: 'item-electronics.png', buyPrice: 45, sellPrice: 80, shelfLife: null, cold: false },
  { id: 'clothing', name: 'Quần áo', icon: '👕', iconAsset: 'item-clothing.png', buyPrice: 25, sellPrice: 50, shelfLife: null, cold: false },
  { id: 'household', name: 'Gia dụng', icon: '🏠', iconAsset: 'item-household.png', buyPrice: 30, sellPrice: 60, shelfLife: null, cold: false },
  { id: 'food', name: 'Thực phẩm', icon: '🥗', iconAsset: 'item-food.png', buyPrice: 20, sellPrice: 48, shelfLife: 3, cold: false },
  { id: 'beverage', name: 'Đồ uống', icon: '🧃', iconAsset: 'item-beverage.png', buyPrice: 15, sellPrice: 36, shelfLife: 5, cold: false },
  { id: 'frozen', name: 'Đông lạnh', icon: '🧊', iconAsset: 'item-frozen.png', buyPrice: 35, sellPrice: 78, shelfLife: 7, cold: true }
];

// 3 Nhà cung cấp (Phase 2)
const SUPPLIERS = [
  {
    id: 'wholesaler',
    code: 'Nhà A',
    name: 'Kho Sỉ Chợ Lớn',
    priceMult: 0.85,
    products: ['food', 'beverage', 'clothing', 'household'],
    delayChance: 0.10,
    badge: 'Giá ×0.85 • 4 món thường',
    desc: 'Về sáng ngày thứ 2 sau khi đặt (10% trễ 1 ngày)'
  },
  {
    id: 'fast247',
    code: 'Nhà B',
    name: 'Giao Nhanh 247',
    priceMult: 1.0,
    products: ['electronics', 'clothing', 'household', 'food', 'beverage', 'frozen'],
    delayChance: 0.10,
    badge: 'Giá ×1.0 • Đủ 6 món',
    desc: 'Đặt trước 12:00 về 14:00 cùng ngày, sau 12:00 về 14:00 hôm sau (10% trễ 1 ngày)'
  },
  {
    id: 'express',
    code: 'Nhà C',
    name: 'Siêu Tốc Express',
    priceMult: 1.3,
    products: ['electronics', 'clothing', 'household', 'food', 'beverage', 'frozen'],
    delayChance: 0,
    badge: 'Giá ×1.3 • Đủ 6 món',
    desc: 'Giao ngay lập tức vào kho dự trữ • Không bao giờ trễ'
  }
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

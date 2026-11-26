# Logistic Center — Phase 1 (v1.0.1)

## Thay đổi trong bản v1.0.1
1. **Sửa lỗi bảng Asset (`js/assets.js`, `js/game.js`):** Chuẩn hóa trạng thái nạp (`loading` / `loaded` / `missing`) và đường dẫn tương đối `new URL('assets/' + filename, window.location.href)` để bảng kiểm tra hiển thị đúng trạng thái thực tế của toàn bộ 45 asset.
2. **Tối ưu tốc độ tải lần đầu (`js/assets.js`, `js/game.js`):** Tải ưu tiên 8 ảnh cảnh kho chính + 6 icon sản phẩm trước (`loadPrimary()`) để cảnh kho hiển thị ngay sau vài giây đầu; 26 khung hình chuyển động được lazy-load ở nền sau (`loadSecondary()`).
3. **6 icon sản phẩm riêng (`assets/item-*.png`):** Dùng trực tiếp trong thẻ đơn hàng và ô soạn hàng thay cho emoji/ảnh kệ chung:
   - `item-food.png` (Thực phẩm)
   - `item-electronics.png` (Điện tử)
   - `item-clothing.png` (Quần áo)
   - `item-beverage.png` (Đồ uống)
   - `item-household.png` (Gia dụng)
   - `item-frozen.png` (Đông lạnh)

## Cách chạy thử
1. Giải nén file `logistic-center-v1.0.1.zip`.
2. Chép 13 ảnh gốc + 26 khung hình chuyển động cũ vào chung thư mục `logistic-center-v1.0.1/assets/` (nơi đã có sẵn 6 file `item-*.png`).
3. Chạy máy chủ cục bộ tại thư mục `logistic-center-v1.0.1`:
   ```bash
   python3 -m http.server 8000
   ```
4. Mở `http://localhost:8000` (bấm **Ctrl+Shift+R** hoặc mở Tab Ẩn danh để trình duyệt nhận Service Worker `logistic-center-cache-v1.0.1`).

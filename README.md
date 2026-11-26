# Logistic Center — v1.2 (Giao diện ngang điện thoại + nền scene-bg.png)

## Thay đổi trong bản v1.2
- **Nền cảnh kho `assets/scene-bg.png`:** Dùng ảnh nền kho isometric dollhouse sạch phủ toàn màn hình không méo ảnh; bỏ vẽ cảnh rời rạc bằng canvas cũ.
- **Sprite động trên nền:** Nhân viên (`worker-walk-1..4`, `worker-carry-1..2`), xe nâng (`forklift-1..3`), băng chuyền (`conveyor-1..4`), tài xế và xe giao hàng (`bike-1..3`, `truck-small-1..3`, `truck-large-1..3`) chạy mượt trên lớp canvas trong suốt phía trên nền.
- **HUD nổi gọn nhẹ:** Các chip bo tròn rời (`Ngày • giờ`, `$`, `Nợ`, `★`, `Cấp/XP`) và 2 nút tròn góc trên phải (`⏸`, `1x`).
- **Thẻ đơn hàng nổi phía dưới + 1 nút Menu tròn lớn:** Hàng thẻ đơn ngang có ảnh sản phẩm thật (`item-*.png`), thời gian, tiền thưởng và nút **Soạn**; 7 mục (`Đơn hàng`, `Kệ`, `Đóng gói`, `Phối xe`, `Nhà cung cấp`, `Nhân viên`, `Ngân hàng`) gom vào nút **Menu** góc dưới phải, mở bảng trượt lên không che hết cảnh kho.
- **Chuẩn điện thoại ngang:** `100dvh × 100dvw`, `env(safe-area-inset-*)`, nút tối thiểu `44×44px`, chữ nút `≥16px`, chữ nội dung `≥14px`.
- **Giữ nguyên 100% cơ chế & số liệu v1.1** (`SAVE_KEY = "logistic-center-v1"`, `VERSION = "1.2"`, `CACHE_NAME = 'logistic-center-cache-v1.2'`).

## Cách chạy thử
1. Giải nén `logistic-center-v1.2.zip`.
2. Chép 45 ảnh asset cũ vào thư mục `logistic-center-v1.2/assets/` VÀ lưu ảnh nền sạch đính kèm trong chat thành `logistic-center-v1.2/assets/scene-bg.png`.
3. Chạy máy chủ cục bộ:
   ```bash
   python3 -m http.server 8000
   ```
4. Mở `http://localhost:8000` (bấm **Ctrl+Shift+R** hoặc mở Tab Ẩn danh để nhận Service Worker `logistic-center-cache-v1.2`).

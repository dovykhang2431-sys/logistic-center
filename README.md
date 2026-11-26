# Logistic Center — Phase 1 (v1.0.2)

## Thay đổi trong bản v1.0.2
1. **Nút "Đóng gói 1 đơn" (`js/game.js`):** Tự gán đơn chờ lâu nhất (`ready_to_pack`, ưu tiên ID nhỏ nhất) vào bàn trống và bắt đầu đóng gói ngay; nếu không còn đơn chờ thì hiện thông báo rõ `"Chưa có đơn chờ đóng gói."`.
2. **Đồng bộ tiền header với tổng kết ngày (`js/game.js`):** Cập nhật ngay `#stat-money` bằng đúng số dư sau khi trừ lương và chi phí cố định lúc 20:00.
3. **Sửa nhãn bàn đóng gói trùng lặp (`js/game.js`):** Xóa `alt` lặp chữ và hiển thị thống nhất `Bàn #1 — Trống` / `Bàn #1 — Đơn #X`.
4. **Ân hạn đơn hàng khi tải lại trang (`js/game.js`):** Các đơn đang chờ khi nạp từ save có `timeLeft < 30` sẽ được đặt tối thiểu `30s`.
5. **Kéo dài thời lượng ngày (`js/config.js`, `js/game.js`):** Một ngày kéo dài `240s` (4 phút thực ở tốc độ 1x); thời hạn đơn tăng tương ứng (thường `260s`, gấp `150s`), giãn chu kỳ tự sinh đơn lên `36s`. Giữ nguyên lương và chi phí cố định 1 lần/ngày.
6. **Sửa hiển thị đơn chờ ở tab Đóng gói (`js/game.js`):** Đưa tổng số đơn chờ lên thanh chung, bàn không giữ đơn chỉ hiển thị `"Trống"`.

## Cách chạy thử
1. Giải nén `logistic-center-v1.0.2.zip`.
2. Chép thư mục `assets/` (đủ 45 ảnh từ bản v1.0.1) vào bên trong `logistic-center-v1.0.2/`.
3. Chạy máy chủ cục bộ:
   ```bash
   python3 -m http.server 8000
   ```
4. Mở `http://localhost:8000` (bấm **Ctrl+Shift+R** hoặc mở Tab Ẩn danh để nhận Service Worker `logistic-center-cache-v1.0.2`).

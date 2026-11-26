# Logistic Center — Phase 2 (v1.1): Tài chính & Nhà cung cấp

## Tính năng mới trong Phase 2 (v1.1)
1. **3 Nhà cung cấp (`js/config.js`, `js/game.js`):**
   - **Nhà A — Kho Sỉ Chợ Lớn:** Giá ×0.85, bán 4 món thường (Thực phẩm, Đồ uống, Quần áo, Gia dụng), về sáng ngày thứ 2 sau đặt (10% trễ 1 ngày).
   - **Nhà B — Giao Nhanh 247:** Giá ×1.0, đủ 6 món, đặt trước 12:00 về 14:00 cùng ngày / sau 12:00 về 14:00 hôm sau (10% trễ 1 ngày).
   - **Nhà C — Siêu Tốc Express:** Giá ×1.3, đủ 6 món, giao ngay vào Kho dự trữ, không bao giờ trễ.
   - Chiết khấu theo số lượng: đặt ≥10 sp giảm 5%, ≥20 sp giảm 10%; hiển thị so sánh giá 2 nhà còn lại.
2. **Ngân hàng (Tab mới `🏦 Ngân hàng`):**
   - Vay vốn theo hạn mức `5000 + Danh tiếng×50 + (Cấp−1)×1000`, lãi 1%/ngày, trả tối thiểu `max($50, 5% dư nợ)` (tự trừ hoặc hoãn nếu không đủ tiền), nút Trả nợ tùy ý.
   - Gửi / Rút tiết kiệm bất cứ lúc nào, lãi 0.2%/ngày cộng trong tổng kết ngày.
   - Header hiển thị `💳 Nợ: $X` khi dư nợ > 0; tổng kết ngày thêm 3 dòng Lãi tiết kiệm, Lãi vay, Trả nợ tối thiểu.
3. **Phá sản hoàn thiện:**
   - Tự động vay khẩn cấp phần thiếu chi phí cố định (trong hạn mức còn lại); chỉ phá sản khi vay khẩn cấp vẫn không đủ.
   - Không xóa `localStorage`; modal phá sản có 2 nút **Chơi lại từ lần lưu gần nhất** và **Bắt đầu lại từ đầu**.
4. **Kho dự trữ (`reserve`) & Châm hàng:**
   - Hàng từ cả 3 nhà cung cấp về `reserve` trước; kệ có sức chứa `12 sp/loại`.
   - Nút **Châm hàng** từng món (FEFO) và **Châm tất cả**; giảm HSD cho cả kệ và kho dự trữ; hiển thị `Kệ X/12 • Dự trữ Y`, `HSD gần nhất` và cảnh báo `⚠️ Sắp hết hạn!` khi `daysLeft ≤ 1`.
5. **Soạn theo lô (Batch picking):**
   - Nút **⚡ Soạn tất cả đơn đang chờ** duyệt đơn `picking` theo ID tăng dần, dùng `consumeStock()` (FEFO giữ nguyên), giữ nguyên số đã soạn cho đơn thiếu hàng và ghi 1 dòng log tổng kết.

## Cách chạy thử
1. Giải nén `logistic-center-v1.1.zip`.
2. Chép thư mục `assets/` (đủ 45 ảnh hiện có) vào bên trong `logistic-center-v1.1/`.
3. Chạy máy chủ cục bộ:
   ```bash
   python3 -m http.server 8000
   ```
4. Mở `http://localhost:8000` (bấm **Ctrl+Shift+R** hoặc mở Tab Ẩn danh để trình duyệt kích hoạt Service Worker `logistic-center-cache-v1.1`).

# ADR-001: Chuyển Đổi Mô Hình Trạng Thái Đèn Lồng & Luật Thắng "Giữ Đảo Sáng Tới Bình Minh" (Phase 3)

- **Trạng thái:** Đã duyệt & Áp dụng (Phase 3 — Ticket-03 · Contract v1.2)
- **Bối cảnh:** Sau playtest Phase 2, người chơi giàu kinh nghiệm có thể thắp đủ đèn chỉ trong ~2 phút rồi kết thúc ngay (`all_lit`), khiến giai đoạn cuối Đêm mất kịch tính. Ticket-03 yêu cầu thay đổi luật cốt lõi: đèn đã thắp bị hao dầu theo thời gian, Bóng Mực có thể hút dầu đèn yếu, và mục tiêu đổi từ "thắp hết để thắng sớm" sang "giữ đủ đèn sáng tới bình minh".

## Quyết định Thiết kế

### 1. Mô hình trạng thái Đèn Lồng (Lantern State Machine)
Thay mô hình nhị phân cũ (`lit: false -> true` một chiều) bằng mô hình vòng đời có nhiên liệu:
- **Biểu diễn nội bộ bằng số nguyên `fuelTicks` (đơn vị `1/60` fuel):**
  - `FUEL_MAX_TICKS = 6000` (tương ứng `100.0` fuel), `LOW_FUEL_TICKS = 1800` (`30.0` fuel), mỗi đom đóm châm dầu `+600` (`+10.0` fuel).
  - Lý do: loại bỏ hoàn toàn sai số cộng dồn dấu phẩy động IEEE-754 trên 18.000 tick; chỉ làm tròn 1 chữ số thập phân (`round1`) khi xuất JSON snapshot/event.
- **Chuyển trạng thái:**
  - `Unlit (ever_lit=false)` → nạp đủ `10` → `Lit (fuel=100, ever_lit=true, +100đ, successful_lights++)`.
  - `Lit (fuel >= 30)`: có vùng an toàn 6 m, tự hao `1/60` mỗi tick; châm dầu bằng `min(carried, ceil((6000 - fuelTicks)/600))` đom đóm (`+5đ/đom đóm`, sự kiện `refuel`).
  - `Lit (0 < fuel < 30)`: **mất vùng an toàn**, trở thành mục tiêu ưu tiên cho Bóng Mực ở trạng thái `wander` tiến vào `<= 2 m` chuyển sang `drain` (hút thêm `5/60` mỗi tick/con). Khi được châm dầu lại lên `>= 30`, vùng an toàn khôi phục và đẩy Bóng Mực trong bán kính 6 m ra mép trong tối đa 30 tick (không gây sát thương trong lúc đẩy).
  - `fuel <= 0` (kiểm tra ngay sau Bước 2 trừ dầu): chuyển sang `Unlit (ever_lit=true, deposited=0, fuel=0)`, phát `lantern_out`.
  - `Unlit (ever_lit=true)` → nạp đủ `5` (`relight_cost`) → `Lit (fuel=100, relit_count++, +40đ, successful_lights++, lantern_lit {relight: true})`.

### 2. Sức chứa tăng dần & Điều kiện thắng tại Bình Minh
- **Sức chứa:** `capacity = min(20, 10 + 2 * successful_lights)` đặt lại mỗi Đêm; đèn `lit: true` đặt sẵn trong scenario không tăng `successful_lights`.
- **Luật thắng/thua mới (Bước 11):**
  - Bỏ hoàn toàn thắng sớm `all_lit`. Thời lượng Đêm 1/2/3 rút còn `240 / 270 / 300 s`.
  - Ưu tiên 1: `flames <= 0` → thua ngay (`no_flames`), kể cả ở tick bình minh.
  - Ưu tiên 2: `remainingTicks <= 0` → thắng `dawn_survived` nếu `litCount >= ceil(0.6 * totalLanterns)` (`3/5`, `4/6`, `5/7`), cộng thưởng `+50 + floor(fuel)` mỗi đèn sáng + `50 * flames`; ngược lại thua `dawn`.

## Hệ quả & Tác động Tới Test Cũ
- Các test Phase 1–2 kiểm tra thắng sớm `all_lit`, thưởng thời gian, `per_mote = 10` và thời lượng `300/330/360 s` trở nên không hợp lệ theo luật mới → được cập nhật trực tiếp kèm ghi chú lý do rõ ràng (không skip âm thầm).
- Toàn bộ các test không bị thay thế (di chuyển, cam_yaw, nhảy, lướt, rơi hồi sinh, địa hình Đêm 2/3, Gió Lạc, Bùa Gió, Tạm dừng, validation exit code 2, tất định) giữ nguyên và phải tiếp tục PASS.

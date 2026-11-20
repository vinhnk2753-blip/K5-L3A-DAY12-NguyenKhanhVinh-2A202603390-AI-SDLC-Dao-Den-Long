# Changelog

## [Phase 3] - Ticket-03 "Đèn cạn dầu" (Contract v1.2)
### Breaking Changes (Thay đổi phá vỡ tương thích)
- **Nhiên liệu đèn (`fuel`):** Đèn sáng không còn sáng vĩnh viễn — bắt đầu ở `fuel = 100`, tự hao `1.0/s` (tính bằng đơn vị nguyên `1/60`), có thể châm dầu (`refuel`, `+10`/đom đóm); khi `fuel <= 0` đèn tắt (`lantern_out`, `deposited = 0`, `ever_lit = true`), thắp lại tốn `5` đom đóm (`relight_cost`).
- **Bóng Mực hút dầu (`drain`):** Đèn có `fuel < 30` mất vùng an toàn (`== 30` vẫn giữ). Bóng Mực `wander` ưu tiên tìm đèn yếu `< 30` và chuyển sang trạng thái `drain` hút `5 fuel/s` (phát `fuel_drain` mỗi 60 tick). Hết choáng luôn về `wander`.
- **Luật thắng mới (`dawn_survived`):** Bỏ hoàn toàn thắng sớm `all_lit` và thưởng thời gian. Thời lượng Đêm 1/2/3 đổi sang `240 / 270 / 300 s`. Thắng khi sống tới bình minh với ít nhất `ceil(0.6 × tổng đèn)` đèn đang sáng (`3/5`, `4/6`, `5/7`).
- **Công thức điểm mới:** `+5` mỗi đom đóm nạp/châm (trước đây `+10`), `+100` thắp lần đầu, `+40` thắp lại, `+5` Pulse thường / `+15` Pulse trúng Bóng đang `drain`, thưởng bình minh `+50 + floor(fuel)` mỗi đèn sáng + `+50` mỗi Ngọn Lửa còn lại.
- **Contract v1.2:** Snapshot thêm `lanterns[].{fuel, ever_lit, relit_count}`, `player.capacity`, trạng thái Bóng `drain`; sự kiện mới `refuel`, `lantern_out`, `fuel_drain`, `lantern_lit.relight`, `game_over.reason = "dawn_survived"`.

### Tính năng mới
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)` đặt lại đầu mỗi Đêm.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** lưu bền vững; đổi Bóng Mực `#7A3CFF → #00B3FF`, cảnh báo UI `#FF5A5F → #FFFFFF + ⚠`; đèn tắt xẹp 20% + vết rách giấy; thanh nhiên liệu trên đèn & nhấp nháy 1 Hz khi `fuel < 30`.
- Bổ sung [ADR-001](docs/notes/ADR-001-lantern-fuel-and-dawn-win.md) ghi nhận quyết định thiết kế.

## [Phase 2] - Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa toàn bộ thông số vận tốc, vật lý, điểm số và quy trình 12 bước/tick theo Ticket-02 (`game.contract.json` v1.1).
- Mở rộng thành chuỗi **3 Đêm**: Đảo Bến, Đảo Cau (cầu tre + bục nhảy), Đảo Chuông (3 tầng + 2 dốc + bục nhảy + Tháp Chuông + gió mạnh).
- Bổ sung Lướt (Dash), Gió Lạc (Drifters), Bùa Gió (Wind Charms), Tạm dừng, Cài đặt bền vững, Web Audio BGM + 14 SFX, HUD + mũi tên chỉ đèn và bảng màu chuẩn.

## [Phase 1] - PRD-0 (Contract v1.0)
- Khởi tạo dự án TypeScript + Three.js + Vite + Vitest + Node headless CLI, lõi 60 Hz tất định, Đêm 1 Đảo Bến, harness AI và bằng chứng Phase 1.

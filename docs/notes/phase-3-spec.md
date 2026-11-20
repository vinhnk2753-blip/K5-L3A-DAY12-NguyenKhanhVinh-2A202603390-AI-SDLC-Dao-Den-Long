# Phase 3 Spec & Acceptance Criteria (Ticket-03 "Đèn cạn dầu" · Contract v1.2)

## 1. Luật bị Thay Thế (Breaking Changes)
Xem chi tiết kiến trúc tại [ADR-001-lantern-fuel-and-dawn-win.md](ADR-001-lantern-fuel-and-dawn-win.md).

1. **Nhiên liệu đèn:** Đèn sáng hao `1.0/s` (`1/60` tick), tối đa `100`, châm dầu `used = min(carried, ceil((100 - fuel)/10))`, đầy dầu không được chọn; hết dầu `<= 0` tắt (`lantern_out`, `deposited = 0`, `ever_lit = true`), thắp lại chỉ cần `5` đom đóm.
2. **Bóng Mực hút dầu (`drain`):** Đèn `fuel < 30` mất vùng an toàn (`== 30` còn). Bóng `wander` tìm đèn yếu `< 30` gần nhất (không có thì đèn tắt gần nhất), vào `<= 2 m` chuyển `drain` hút `5/s` (`fuel_drain` mỗi 60 tick). Từ `drain` → `chase` nếu Mây `<= 6 m`, → `stunned` nếu trúng Pulse (`+15` điểm thay vì `+5`), → `wander` nếu đèn tắt / `fuel >= 30` / cách `> 2 m`. Hết choáng luôn về `wander`. Châm dầu lên `>= 30` đẩy Bóng trong 6 m ra mép trong `<= 30` tick.
3. **Luật thắng mới:** Thời lượng Đêm 1/2/3 = `240 / 270 / 300 s`. Không thắng sớm `all_lit`. Sống tới bình minh với `lit >= ceil(0.6 * total)` (`3/5`, `4/6`, `5/7`) → thắng `dawn_survived`; ngược lại thua `dawn` (hết Ngọn Lửa luôn thua `no_flames` trước).
4. **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 * successful_lights)` (đặt sẵn bằng scenario không tính).
5. **Điểm mới:** `+5`/đom đóm nạp/châm; `+100` thắp lần đầu; `+40` thắp lại; `+5` Pulse thường / `+15` Pulse trúng Bóng đang `drain`; thắng bình minh cộng `+50 + floor(fuel)` mỗi đèn sáng + `+50` mỗi Ngọn Lửa còn lại; bỏ thưởng thời gian.
6. **Chế độ mù màu:** Cài đặt lưu bền vững đổi Bóng Mực `#7A3CFF → #00B3FF`, cảnh báo UI `#FF5A5F → #FFFFFF + ⚠`; đèn tắt xẹp 20% + vết rách giấy; đèn sáng có thanh dầu, nhấp nháy 1 Hz khi `fuel < 30`.

## 2. Acceptance Criteria & Kế hoạch Kiểm chứng

| ID | Yêu cầu | Kịch bản / Test chứng minh |
|---|---|---|
| P3-AC1 | `game.contract.json` v1.2 đồng bộ code (`fuel_max`, `relight_cost`, `win_ratio`, `drain_per_s`, `240/270/300`) | Unit test `engine.test.ts` |
| P3-AC2 | Hao dầu nguyên `1/60`, châm dầu `refuel`, đầy dầu bỏ qua, cạn dầu phát `lantern_out`, thắp lại tốn `5` phát `lantern_lit {relight: true}` | Scenario `tests/scenarios/phase3/fuel-refuel-relight.scenario.json` |
| P3-AC3 | Bóng `wander` đi tới đèn `< 30` → `drain` hút `5/s` phát `fuel_drain` mỗi 60 tick; Pulse trúng `drain` cộng `+15`, hết choáng về `wander`; châm lên `>= 30` đẩy Bóng ra mép | Scenario `tests/scenarios/phase3/shade-drain-pulse.scenario.json` |
| P3-AC4 | Không thắng sớm `all_lit`; hết giờ với `3/5` sáng → `won / dawn_survived` + thưởng `+50 + floor(fuel)` + `50*flames`; `< 3/5` → `lost / dawn`; hết máu ở tick cuối → `lost / no_flames` | Scenario `tests/scenarios/phase3/dawn-survived-win.scenario.json` & unit tests |
| P3-AC5 | Sức chứa tăng `10 + 2 * successful_lights` tối đa `20`; đèn đặt sẵn không tính | Scenario `tests/scenarios/phase3/dynamic-capacity.scenario.json` |
| P3-AC6 | Chế độ mù màu lưu bền vững (`#00B3FF`, `#FFFFFF + ⚠`), đèn tắt xẹp 20% + vết rách, thanh dầu & nhấp nháy 1 Hz `< 30` | Kiểm tra build + trình duyệt `1280×720` |
| P3-AC7 | Regression toàn bộ test Phase 1–2 không bị thay thế + tính tất định 3 Đêm | `npm run verify` |

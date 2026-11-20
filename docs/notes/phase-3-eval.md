# Đánh giá & Nhật ký AI — Phase 3 (Ticket-03 "Đèn cạn dầu" · Contract v1.2)

## 1. Bảng Truy vết Yêu cầu → Bằng chứng (Phase 3)

| ID | Yêu cầu chính (Ticket-03) | Cách kiểm chứng | Bằng chứng (khớp tag `phase-3`) | Kết quả |
|---|---|---|---|---|
| P3-AC1 | `game.contract.json` v1.2 đồng bộ code (`fuel_max`, `relight_cost`, `win_ratio`, `drain_per_s`, `240/270/300`) | Unit test `tests/sim/engine.test.ts` | `docs/proof/phase-3/verify-report.txt` (26/26 pass) | Đạt |
| P3-AC2 | Hao dầu nguyên `1/60`, châm dầu `refuel`, bỏ qua đèn đầy, tắt phát `lantern_out`, thắp lại tốn `5` (`relight: true`, `+40đ`) | Scenario `fuel-refuel-relight` + unit test `phase3.test.ts` | `docs/proof/phase-3/fuel-refuel-relight.jsonl` (tick 30 `lantern_out`, tick 36 `relight: true`, `score=65`, `capacity=12`) | Đạt |
| P3-AC3 | Bóng `wander` tìm đèn yếu `< 30` → `drain` hút `5/s` (`fuel_drain` mỗi 60 tick), Pulse trúng `drain` `+15đ`, hết choáng về `wander`, châm `>= 30` đẩy Bóng ra mép | Scenario `shade-drain-pulse` + unit tests | `docs/proof/phase-3/shade-drain-pulse.jsonl` (S1 `+15đ`, S2 `fuel_drain` 19 → 13 mỗi 60 tick) | Đạt |
| P3-AC4 | Bỏ thắng sớm `all_lit`, thắng tại bình minh (`dawn_survived`) khi sáng `>= ceil(0.6×N)` + thưởng `+50+floor(fuel)` + `50×flames`; `no_flames` ưu tiên trước kể cả tick cuối | Scenario `dawn-survived-win` + unit tests | `docs/proof/phase-3/dawn-survived-win.jsonl` (tick 60 `dawn_survived`, `score=427`) | Đạt |
| P3-AC5 | Sức chứa tăng `min(20, 10 + 2×successful_lights)`, đèn đặt sẵn không tính | Scenario `dynamic-capacity` + unit test | `docs/proof/phase-3/dynamic-capacity.jsonl` (`capacity: 18 → 20`) | Đạt |
| P3-AC6 | Chế độ mù màu lưu bền vững (`#00B3FF`, `#FFFFFF + ⚠`), đèn tắt xẹp 20% + vết rách, thanh dầu & nhấp nháy 1 Hz `< 30` | `tsc --noEmit` + `vite build` + kiểm tra trực quan cùng Phase 4 | `docs/proof/phase-3/verify-report.txt` (built 1.05s; ảnh kiểm tra UI chi tiết ghi ở Phase 4) | Đạt |
| P3-AC7 | Regression toàn bộ test Phase 1–2 không bị thay thế + tất định 3 Đêm + benchmark 18.000 tick | `npm run verify` | `docs/proof/phase-3/verify-report.txt` (SHA-256 3 Đêm khớp, 18.000 tick trong `0.101s`) | Đạt |

## 2. Xử lý Thay đổi Luật (Change Request) & Tài liệu ADR
- Đã viết [ADR-001](ADR-001-lantern-fuel-and-dawn-win.md) phân tích lý do chuyển đổi sang mô hình nhiên liệu nguyên `1/60` (`fuelTicks`) và luật thắng tại bình minh `dawn_survived`.
- Đã cập nhật mục **Breaking Changes** trong `CHANGELOG.md`.
- Các test Phase 1–2 bị luật mới thay thế (`all_lit`, `per_mote=10`, thời lượng `300/330/360 s`) đã được cập nhật kèm ghi chú lý do rõ ràng ngay đầu `tests/sim/engine.test.ts` — không tắt (skip) âm thầm test nào. Toàn bộ 7 test Phase 2 (`phase2.test.ts`) và 4 test CLI (`headless.test.ts`) vẫn PASS nguyên vẹn.

## 3. Nhật ký Lỗi AI & Ước tính Token (Phase 3)
1. **Lỗi 1 — Kịch bản `shade-drain-pulse` ban đầu đặt Mây cách Bóng `drain` 2 m nhưng bấm Pulse ở tick 65:**
   - *Phát hiện:* Tự rà soát theo luật `drain → chase khi Mây vào trong 6 m` trước khi chạy test — nếu chờ tới tick 65, Bóng đã chuyển sang `chase` ở tick 1!
   - *Khắc phục:* Tách 2 Bóng trên 2 đèn yếu (`S1` ở L1 bị Pulse ở tick 0 trước Bước 8 để kiểm tra `+15đ`, `S2` ở L2 hút dầu liên tục để kiểm tra `fuel_drain` ở tick 61 & 121).
2. **Lỗi 2 — Import thừa `InputFrame` trong `tests/sim/phase3.test.ts` (TS6196):**
   - *Phát hiện:* Cổng `npm run verify` (`tsc --noEmit`) chặn ngay lập tức.
   - *Khắc phục:* Xóa import thừa và chạy lại cổng kiểm chứng xanh 100%.
3. **Ước tính token Phase 3:** ~32k input tokens, ~11k output tokens (chi phí tương đương ~\$0.12–\$0.20; tiết kiệm nhờ tái sử dụng hoàn toàn `terrain.ts` và khung 12 bước/tick từ Phase 2).

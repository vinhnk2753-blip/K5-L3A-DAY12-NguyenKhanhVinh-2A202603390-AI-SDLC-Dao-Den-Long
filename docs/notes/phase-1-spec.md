# Phase 1 Spec, Giả định & Kế hoạch Kiểm chứng (PRD-0 · Contract v1.0)

## 1. Phân tách Yêu cầu Bắt buộc vs Chỗ Mơ hồ

### Bắt buộc (từ PRD-0 & Test Contract v1.0)
- **Màn chơi:** Đêm 1 – Đảo Bến, đảo tròn mặt đất `Y = 0`, 5 Đèn Lồng Lớn (`L1`…`L5`).
- **Nhân vật Mây:** Xuất phát `(0, 0, 0)`, đi lại 3D, nhảy, camera góc nhìn thứ ba, đội nón lá có treo đèn lồng nhỏ.
- **Vòng lặp lõi:** Nhặt đom đóm → nạp ánh sáng để thắp Đèn Lồng Lớn → tránh / Tỏa Sáng xua Bóng Mực → thắp hết 5 đèn thì thắng (`all_lit`), hết máu thua (`no_flames`), hết thời gian thua (`dawn`).
- **Tài nguyên & Thẩm mỹ:** Không khí đêm cổ tích, đảo sáng dần khi thắp đèn, vàng cam ấm là tốt, tím đen là nguy hiểm, không bạo lực/máu me.
- **Test Contract v1.0:**
  - File `game.contract.json` ở gốc repo khớp chính xác mọi thông số `tuning`.
  - Headless CLI 60 tick/giây cố định, không cần GPU/cửa sổ, hỗ trợ `--seed`, `--night 1`, `--scenario`, `--inputs`, `--ticks`, `--out`, `--snapshot-every`.
  - Thoát mã `0` khi hợp lệ, mã `2` khi file inputs/scenario sai cú pháp hoặc schema, mã khác `0` khi lỗi khác.
  - Snapshot tick 0 trước input; bước `k` tạo trạng thái & event ở `tick = k + 1`; dòng cuối là `end`.
  - Tính tất định tuyệt đối theo `--seed`.

### Chỗ mơ hồ trong PRD-0 & Giả định Phase 1
| Hạng mục mơ hồ | Giả định Phase 1 | Lý do |
|---|---|---|
| Tốc độ Mây & nhảy | `player_speed = 6.5 m/s`, nhảy `v_y = 7.0 m/s`, trọng lực `-20 m/s²` | Cảm giác nhanh nhẹn trên đảo bán kính 40m |
| Kích thước đảo & ranh giới | Đảo tròn bán kính `40 m`, `fall_enabled = false` (giữ Mây trong mép đảo) | PRD-0 chưa yêu cầu cơ chế rơi khỏi đảo; tránh phạt bất ngờ ở bản đầu |
| Đom đóm | Sức chứa `10`, nhặt bán kính `1.2 m`, sinh 20 con đầu màn, tối đa `30`, thêm 1 con mỗi 4 giây (240 tick) | Đủ ánh sáng cho 5 đèn (40 đom đóm) + dùng Tỏa Sáng |
| Đèn Lồng Lớn | Chi phí `8` đom đóm/đèn, nạp từng phần trong bán kính `2.2 m`, vùng an toàn `6.0 m` | 5 đèn đặt đều trên vòng bán kính 25 m quanh tâm |
| Tỏa Sáng (Pulse) | Chi phí `3` đom đóm, bán kính `5.0 m`, choáng `2.0 s`, đẩy `4.0 m` (15 tick), hồi `3.0 s` | Đủ răn đe Bóng Mực mà vẫn cần cân nhắc tài nguyên |
| Bóng Mực | Tốc độ `4.0 m/s`, chạm bán kính `1.0 m`, phát hiện `12 m` / bỏ đuổi `18 m`, sinh 2 con lúc 5s rồi mỗi 8s tối đa 6 con | Áp lực tăng dần, né được vùng an toàn quanh đèn sáng |
| Máu & Bị đánh | `flames = 3`, bất tử `1.5 s` (90 tick), rơi `floor(carried * 0.5)` đom đóm (nhặt lại được từ tick sau) | Cân bằng giữa rủi ro và khả năng hồi phục |
| Thời lượng Đêm 1 | `night1_duration_s = 240 s` | Vừa đủ 4 phút căng thẳng cho 5 đèn |
| Cách tính điểm | `+10` mỗi đom đóm **nạp** vào đèn (không cộng lúc nhặt để tránh farm rơi-nhặt vô hạn), `+100` mỗi đèn thắp, `+5` mỗi Bóng Mực trúng Tỏa Sáng, thắng cộng `+2/giây còn lại` và `+50/Ngọn Lửa còn lại` | Thưởng trực tiếp hành vi hoàn thành mục tiêu |

## 2. Tiêu chí Nghiệm thu (Acceptance Criteria) & Kế hoạch Kiểm chứng

| ID | Yêu cầu | Cách kiểm chứng (nghĩ trước khi code) |
|---|---|---|
| P1-AC1 | Di chuyển đúng theo `move` + `cam_yaw_deg`, chuẩn hóa vector > 1 | Unit test & headless scenario `move-yaw` |
| P1-AC2 | Nhặt đom đóm trong `pickup_radius`, giới hạn `carry_capacity`, phát `mote_picked` | Unit test & scenario `pickup-deposit-win` |
| P1-AC3 | Nạp ánh sáng vào đèn trong `interact_radius`, thắp đủ 5 đèn → `won / all_lit` + cộng điểm thắng | Headless scenario `pickup-deposit-win` |
| P1-AC4 | Tỏa Sáng tốn `pulse_cost`, choáng + đẩy Bóng Mực trong `pulse_radius`, vào cooldown, phát `pulse` | Headless scenario `pulse-stun` |
| P1-AC5 | Bóng Mực đuổi và chạm Mây → mất 1 Ngọn Lửa, rơi 50% đom đóm, bất tử `1.5s`; 0 Ngọn Lửa → `lost / no_flames` | Headless scenario `shade-hit-loss` |
| P1-AC6 | Vùng an toàn `safe_radius` quanh đèn sáng chặn Bóng Mực | Headless scenario `safe-zone` |
| P1-AC7 | Hết giờ `night1_duration_s` khi chưa đủ đèn → `lost / dawn` | Headless scenario `dawn-timeout` |
| P1-AC8 | `game.contract.json` khớp 100% `tuning` trong code; CLI trả mã `2` khi file inputs/scenario lỗi; tất định tuyệt đối | Unit test đồng bộ contract + `npm run verify` |
| P1-AC9 | Game 3D chơi được Đêm 1: Mây đội nón lá treo đèn, đảo sáng dần, HUD đầy đủ, chơi lại được | Mở chạy thật bản 3D trên trình duyệt và chụp ảnh bằng chứng |

# Phase 2 Spec, Thay đổi từ Phase 1 & Acceptance Criteria (Ticket-02 · Contract v1.1)

## 1. So sánh & Cập nhật Giả định từ Phase 1 → Phase 2

| Hạng mục | Giả định Phase 1 (PRD-0) | Chuẩn mới Phase 2 (Ticket-02) | Ảnh hưởng tới test cũ |
|---|---|---|---|
| `player_speed` | `6.5 m/s` | `6.0 m/s` (tăng tốc/dừng ≤ 0.1 s) | Cập nhật kì vọng vị trí theo `STANDARD_TUNING` |
| `lantern_cost` | `8` đom đóm | `10` đom đóm | Cập nhật scenario `pickup-deposit-win` (nạp 10) |
| `pickup_radius` / `interact_radius` | `1.2 m` / `2.2 m` | `1.0 m` / `2.0 m` | Cập nhật vị trí scenario tương ứng |
| `night1_duration_s` | `240 s` | `300 s` (+ Đêm 2 `330 s`, Đêm 3 `360 s`) | Cập nhật giá trị mặc định & kiểm tra `game.contract.json` |
| `fall_enabled` | `false` (giữ trong r=40m) | `true` (`Y < -10` → −1 Ngọn Lửa, mất hết đom đóm, chờ 60 tick, hồi sinh + bất tử 90 tick) | Bổ sung test rơi khỏi đảo và `lost` trong `player_hit` |
| Tỏa Sáng (Pulse) | Khoảng cách XZ ≤ 5 m | Khoảng cách **3D** từ `(x, y + 0.8, z)` tới tâm Bóng Mực ≤ 5 m | Cập nhật công thức khoảng cách; regression Đêm 1 vẫn đạt |
| Trạng thái Bóng Mực | Tự đặt tên (đã dùng 5 tên chuẩn) | Bắt buộc đúng 5 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned` | Đã khớp sẵn từ Phase 1 |
| Hợp đồng | Contract v1.0 | Contract v1.1 (`night`, `wind`, `vel`, `grounded`, `invuln`, `dash_cd_s`, `pulse_cd_s`, `charm_s`, `motes[].kind/ttl_s`, `drifters`, `charms`, `dash`, `pause`, `night_start`) | Mở rộng test contract & giữ toàn bộ regression Phase 1 |

## 2. Acceptance Criteria — Phần 1, 2, 3 & 4 (Ticket-02)

| ID | Tính năng / Yêu cầu | Tiêu chí nghiệm thu (kiểm chứng được) | Kế hoạch kiểm chứng |
|---|---|---|---|
| P2-AC1 | Chuẩn hóa số liệu & 12 bước/tick | `game.contract.json` v1.1 khớp 100% `STANDARD_TUNING`; toàn bộ regression Phase 1 pass với số chuẩn | Unit test + `tests/sim/engine.test.ts` |
| P2-AC2 | Lướt (Dash) | `14 m/s`, `12 tick` (0.2s), hồi `90 tick` (1.5s tính từ lúc bắt đầu), giữ nguyên Y khi lướt trên không, không bất tử, phát sự kiện `dash {}` | Scenario `tests/scenarios/phase2/dash-and-air.scenario.json` |
| P2-AC3 | Rơi khỏi đảo (`Y < -10`) | Bỏ qua bất tử, xảy ra đúng 1 lần: −1 Ngọn Lửa, mất hết đom đóm, phát `player_hit {by:"fall", dropped:0, lost}`, chờ 60 tick rồi hồi sinh tại `(0,0,0)` với bất tử 90 tick; hết Ngọn Lửa thua ngay | Scenario `tests/scenarios/phase2/fall-respawn.scenario.json` |
| P2-AC4 | Đêm 2 — Đảo Cau + cầu tre + bục nhảy | 2 đảo `r=28` tại `(0,0)` & `(70,0)`, cầu `x∈[26,44], z∈[-2,2]`, 6 đèn `L1..L6`; chạm bục `(20,0,18)` phóng `vy=14, vh=24` về `(70,0,0)` và đáp trong Đảo B | Scenario `tests/scenarios/phase2/night2-jumppad.scenario.json` |
| P2-AC5 | Đêm 3 — Đảo Chuông (3 tầng, 2 dốc, bục nhảy, tháp chuông, gió) | 3 tầng `Y=0/3/6`, 2 dốc 30°/150° rộng 3m đi lên tầng 1, vách đứng chặn đi thẳng, bục `(0,3,13)` đáp tầng 2, tháp chuông `r=2` chặn, 7 đèn `L1..L7`, gió 2 m/s mỗi 30s kéo dài 5s | Scenario `tests/scenarios/phase2/night3-ramps-wind.scenario.json` |
| P2-AC6 | Gió Lạc (Drifters — Đêm 2 & 3) | `idle → chase` khi `carried >= 5 && dist <= 15`; chạm `XZ <= 1.2` cướp `min(3, carried)` phát `drifter_steal` (bỏ qua bất tử & vùng an toàn) → `flee` 240 tick; Pulse trúng khi `chase` → `flee` không cướp; trúng khi `flee` có đồ → thả lại (`drifter_drop`) & biến mất sau 120 tick | Scenario `tests/scenarios/phase2/drifter-steal-pulse.scenario.json` |
| P2-AC7 | Bùa Gió (Wind Charms — Đêm 2 & 3) | Nhặt `C1/C2` phát `charm_picked {charm_id, charm_ticks: 600}`; chạy `7.2 m/s`, Lướt không hồi chiêu, hồi bùa sau `2700` tick | Scenario `tests/scenarios/phase2/wind-charm.scenario.json` |
| P2-AC8 | Tạm dừng (`pause`) | `pause` `false→true` phát `paused {}`, `state: "paused"`, đóng băng `sim_tick`, `time_left_s`, cooldown, spawn, TTL; nhấn lại phát `resumed {}` | Scenario `tests/scenarios/phase2/pause-resume.scenario.json` |
| P2-AC9 | Hiệu năng headless | Chạy đầy đủ Đêm 3 (`21.600` tick) hoàn thành trong `≤ 30 giây`, tất định tuyệt đối | Benchmark trong `npm run verify` & `docs/proof/phase-2/` |
| P2-AC10 | Chuỗi 3 Đêm, Menu, Pause, Cài đặt, Âm thanh, HUD, Bảng màu chuẩn, FPS ≥ 30 | Menu chính → Giới thiệu Đêm (lời Ông Đăng) → Chơi → Kết quả → Bình Minh; Pause (`Esc`/`P`); lưu âm lượng & độ nhạy chuột (`localStorage`); Web Audio BGM + đủ 11 SFX; HUD đủ thành phần + mũi tên chỉ đèn ngoài màn hình; đúng 16 mã màu Hex chuẩn & ánh sáng `0.15 + 0.55*(lit/total)`; ≥ 30 FPS tại 1280×720 | Kiểm tra chạy thật trên trình duyệt 1280×720, đo FPS & chụp ảnh bằng chứng |

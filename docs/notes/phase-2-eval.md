# Đánh giá & Nhật ký AI — Phase 2 (Ticket-02 · Ba hòn đảo · Contract v1.1)

## 1. Bảng Truy vết Yêu cầu → Bằng chứng (Phase 2)

| ID | Yêu cầu chính (Ticket-02) | Cách kiểm chứng | Bằng chứng (khớp tag `phase-2`) | Kết quả |
|---|---|---|---|---|
| P2-AC1 | Chuẩn hóa số liệu & quy trình 12 bước/tick + Regression Phase 1 | `tests/sim/engine.test.ts` (10 test) + đồng bộ `game.contract.json` v1.1 | `docs/proof/phase-2/verify-report.txt` (21/21 pass) | Đạt |
| P2-AC2 | Lướt (Dash): `14 m/s`, `12 tick`, hồi `1.5 s`, giữ độ cao trên không, `dash {}` | Scenario `dash-and-air` + unit test `phase2.test.ts` | `docs/proof/phase-2/dash-and-air.jsonl` | Đạt |
| P2-AC3 | Rơi khỏi đảo (`Y < -10`): bỏ qua bất tử, mất hết đom đóm, chờ 60 tick hồi sinh + bất tử 90 tick | Scenario `fall-respawn` + unit test | `docs/proof/phase-2/fall-respawn.jsonl` | Đạt |
| P2-AC4 | Đêm 2 — Đảo Cau: 2 đảo `r=28`, cầu tre không lan can, bục nhảy phóng sang Đảo B, 6 đèn | Scenario `night2-jumppad` + test trình duyệt | `docs/proof/phase-2/night2-jumppad.jsonl` | Đạt |
| P2-AC5 | Đêm 3 — Đảo Chuông: 3 tầng, 2 dốc 30°/150°, bục nhảy tầng 2, Tháp Chuông `r=2`, gió 2 m/s mỗi 30s | Scenario `night3-ramps-wind` + unit test 4 phần | `docs/proof/phase-2/night3-ramps-wind.jsonl` | Đạt |
| P2-AC6 | Gió Lạc (Drifters): cướp bỏ qua bất tử/vùng an toàn (`drifter_steal`), Pulse khi flee thả đồ (`drifter_drop`) | Scenario `drifter-steal-pulse` + unit test | `docs/proof/phase-2/drifter-steal-pulse.jsonl` | Đạt |
| P2-AC7 | Bùa Gió (Wind Charms): `7.2 m/s`, Lướt không hồi chiêu 600 tick, hồi bùa 2700 tick (`charm_picked`) | Scenario `wind-charm` + unit test | `docs/proof/phase-2/wind-charm.jsonl` | Đạt |
| P2-AC8 | Tạm dừng (`pause`): `state: "paused"`, đóng băng `sim_tick`, thời gian, cooldown, spawn, TTL | Scenario `pause-resume` + thử `Esc` trình duyệt | `docs/proof/phase-2/pause-resume.jsonl` | Đạt |
| P2-AC9 | Hiệu năng headless ≤ 30 s cho 21.600 tick & tính tất định 3 Đêm | `npm run verify` (chạy thật 21.600 tick Đêm 3 + SHA-256 3 Đêm) | `docs/proof/phase-2/verify-report.txt` (**0.119s** cho 21.600 tick, SHA-256 3 Đêm khớp 100%) | Đạt |
| P2-AC10 | Chuỗi 3 Đêm, Menu, Ông Đăng, Pause, Cài đặt bền vững, Web Audio, HUD + mũi tên, bảng màu chuẩn, FPS ≥ 30 ở 1280×720 | Kiểm thử trực tiếp trên trình duyệt `1280×720` (0 console error, reload kiểm chứng lưu âm lượng `45%`, đo FPS trực tiếp Đêm 1/2/3) | `docs/proof/phase-2/night3-gameplay-1280x720.png` (**156–180 FPS** ở 1280×720, Đêm 3 Đảo Chuông) | Đạt |

## 2. Kiểm tra Hồi quy Phase 1 (Regression)
- Toàn bộ 10 test Phase 1 trong `tests/sim/engine.test.ts` chạy lại với số liệu chuẩn `STANDARD_TUNING` và đạt **10/10**.
- Các test đã cập nhật kèm lý do rõ ràng trong mã nguồn và `docs/notes/phase-2-spec.md`: `player_speed` (`6.5 → 6.0`), `lantern_cost` (`8 → 10`), `pickup_radius` (`1.2 → 1.0`), `interact_radius` (`2.2 → 2.0`), `night1_duration_s` (`240 → 300`), `fall_enabled` (`false → true`). Không tắt âm thầm test nào.

## 3. Nhật ký Lỗi AI, Review Độc lập & Cải tiến Harness
1. **Lỗi 1 — Quy ước góc bản đồ Đêm 3 (tránh được sớm nhờ đọc đối chiếu tọa độ):**
   - Trong Three.js tay phải, nhìn từ trên xuống dễ nhầm `z = -r sin α`. Đối chiếu tọa độ thực tế trong Ticket-02 (tầng 1 ở `z > 0`, 2 dốc 30°/150°, đom đóm 20°…160°) khẳng định công thức bắt buộc là `(r cos α, r sin α)`. Đã ghi quy tắc này thẳng vào `AGENTS.md` để không bao giờ tái phạm ở Phase 3–4.
2. **Lỗi 2 — Bóng Mực trong lúc bị đẩy khỏi vùng an toàn (`safePushTicksLeft > 0`) vẫn có thể tự bước ngược lại ở Bước 8:**
   - *Phát hiện:* Rà soát thủ công quy trình 12 bước trước khi commit `src/sim/engine.ts`.
   - *Khắc phục:* Bỏ qua di chuyển thường ở Bước 8 khi `s.safePushTicksLeft > 0`.
3. **Lỗi 3 — Gọi thừa `sim.step(false)` trong `onResume()` ở `src/game/main.ts`:**
   - *Phát hiện:* Rà soát logic pause/resume giữa UI và simulation.
   - *Khắc phục:* Bỏ bước gọi thừa để không nhảy 1 tick khi tiếp tục.
4. **Góp ý từ Subagent Reviewer độc lập Phase 2 (`Phase 2 Independent Reviewer`):**
   - Kết quả: **PASS (0 FAIL)** toàn bộ 6 hạng mục Contract v1.1, 3 bản đồ, Gió Lạc, Bùa Gió, bảng màu chuẩn và tính thuần khiết của `src/sim/`.
   - *Góp ý nhỏ:* `src/game/ui.ts` hiển thị nhắc phím `E` theo đèn chưa sáng đầu tiên trong bán kính `2.0 m` thay vì đèn gần nhất (tie-break theo `id`) giống `engine.ts`.
   - *Khắc phục:* Đã đồng bộ logic chọn đèn gần nhất + tie-break `id` trong `src/game/ui.ts` và chạy lại toàn bộ `npm run verify`.
5. **Tiến hóa Harness ở Phase 2:**
   - Cập nhật `AGENTS.md` (cấm `localeCompare`, chốt quy ước góc `(r cos α, r sin α)` và thứ tự 12 bước/tick).
   - Cập nhật `.agents/skills/verify-phase/SKILL.md` và `scripts/verify-gate.mjs` thêm kiểm tra tính tất định cả 3 Đêm + benchmark 21.600 tick ≤ 30 s.

## 4. Nhật ký Dùng AI & Ước tính Token (Phase 2)
- **Công cụ:** Google Antigravity Agent + 2 subagent `flash` độc lập (`Phase 2 Independent Reviewer` cho review mã nguồn & `Phase 2 3D & FPS Verifier` cho kiểm thử trực quan trình duyệt 1280×720).
- **Ước tính token Phase 2:** ~65k input tokens, ~22k output tokens (chi phí tương đương ~\$0.25–\$0.40; tổng lũy kế Phase 1 + 2 ≈ 110k input / 36k output tokens).
- **Cách tiết kiệm token:**
  - Giao toàn bộ phần đọc review mã nguồn và kiểm thử trình duyệt cho model `flash`.
  - Tách gọn `terrain.ts` khỏi `engine.ts` để dễ kiểm tra hình học 3 bản đồ mà không phải đọc lặp file lớn.
  - Dùng `npm run verify` gộp typecheck + build + test + determinism + benchmark thành 1 lần chạy duy nhất.

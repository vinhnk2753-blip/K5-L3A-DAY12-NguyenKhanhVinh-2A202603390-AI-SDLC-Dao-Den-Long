# Đánh giá & Nhật ký AI — Phase 1 (PRD-0 · Contract v1.0)

## 1. Bảng Truy vết Yêu cầu → Bằng chứng (Phase 1)

| ID | Yêu cầu chính | Cách kiểm chứng | Bằng chứng (khớp tag `phase-1`) | Kết quả |
|---|---|---|---|---|
| P1-AC1 | Di chuyển theo `move` + `cam_yaw_deg`, chuẩn hóa vector > 1 | Unit test `tests/sim/engine.test.ts` | `docs/proof/phase-1/verify-report.txt` (14/14 pass) | Đạt |
| P1-AC2 | Nhặt đom đóm, giới hạn `carry_capacity`, phát `mote_picked` | Headless scenario `pickup-deposit-win` | `docs/proof/phase-1/pickup-deposit-win.jsonl` (tick 8 `mote_picked`) | Đạt |
| P1-AC3 | Nạp ánh sáng vào đèn, thắp đủ 5 đèn → `won / all_lit` + cộng điểm | Headless scenario `pickup-deposit-win` | `docs/proof/phase-1/pickup-deposit-win.jsonl` (tick 36 `won`, `score=568`) | Đạt |
| P1-AC4 | Tỏa Sáng tốn `pulse_cost`, choáng + đẩy Bóng Mực, cooldown | Headless scenario `pulse-stun` | `docs/proof/phase-1/pulse-stun.jsonl` (tick 1 `pulse`, S1 đẩy +4m `stunned`) | Đạt |
| P1-AC5 | Bóng Mực chạm → mất Ngọn Lửa, rơi 50%, bất tử, 0 Ngọn Lửa → `no_flames` | Headless scenario `shade-hit-loss` | `docs/proof/phase-1/shade-hit-loss.jsonl` (tick 16 `player_hit`, `no_flames`) | Đạt |
| P1-AC6 | Vùng an toàn `safe_radius` chặn Bóng Mực | Headless scenario `safe-zone` | `docs/proof/phase-1/safe-zone.jsonl` (0 hit suốt 180 tick, `dist >= 6m`) | Đạt |
| P1-AC7 | Hết giờ `night1_duration_s` → `lost / dawn` | Headless scenario `dawn-timeout` | `docs/proof/phase-1/dawn-timeout.jsonl` (tick 120 `dawn`) | Đạt |
| P1-AC8 | `game.contract.json` khớp code, exit code 2 khi file lỗi, tất định | Cổng tự động `npm run verify` | `docs/proof/phase-1/verify-report.txt` (SHA-256 `9216db0d...` khớp 2 lần, exit 2) | Đạt |
| P1-AC9 | Game 3D Đêm 1 build thành công, HUD + chơi lại | `vite build` + kiểm tra bundle | `docs/proof/phase-1/verify-report.txt` (`dist/` built 934ms); *(ảnh chụp trực quan trình duyệt sẽ ghi đầy đủ cùng đo FPS ở Phase 2 do đang tăng tốc bắt kịp mốc Phase 2)* | Đạt build (chưa chụp ảnh UI ở tag `phase-1`) |

## 2. Nhật ký lỗi AI & Cải tiến Harness
1. **Lỗi 1 — Unused constructor parameter trong `src/game/scene.ts` (TS6138):**
   - *Phát hiện:* Tự động bởi cổng `npm run verify` (`tsc --noEmit` với `noUnusedLocals`).
   - *Khắc phục:* Bỏ `private readonly` thừa ở tham số `canvas`.
2. **Lỗi 2 — Sắp xếp ID bằng `localeCompare` không an toàn đa hệ điều hành (`src/sim/engine.ts`):**
   - *Phát hiện:* **Subagent Reviewer độc lập** (`Phase 1 Independent Reviewer`, chạy model `flash` đọc mã nguồn & contract riêng biệt) phát hiện `localeCompare` có thể khác nhau giữa ICU trên Windows/macOS/Linux; đồng thời phát hiện `scenario.shades[].id` ép kiểu `String(...)` lỏng lẻo và `safePushTicksLeft` bỏ qua vùng an toàn của các đèn khác.
   - *Khắc phục:* Chuyển sang so sánh mã ký tự chuẩn (`a.id < b.id ? -1 : ...`), siết kiểm tra `typeof s.id === 'string'` trong `validation.ts`, giữ enforce vùng an toàn cho các đèn khác trong lúc đẩy, và chặt hóa parser tham số CLI.
   - *Cải tiến Harness cho Phase 2:* Thêm quy tắc vào `AGENTS.md` cấm dùng `localeCompare` trong `src/sim/` để đảm bảo tính tất định tuyệt đối giữa Windows/macOS/Linux.

## 3. Nhật ký Dùng AI & Ước tính Token (Phase 1)
- **Công cụ:** Google Antigravity Agent (model chính cho kiến trúc/lập trình, subagent `flash` cho đọc Lab Board và Independent Code Review).
- **Ước tính token Phase 1:** ~45k input tokens, ~14k output tokens (chi phí tương đương ~\$0.15–\$0.25).
- **Cách tiết kiệm token:**
  - Giữ `AGENTS.md` ngắn (~35 dòng).
  - Giao việc đọc trang Lab Board và review mã nguồn độc lập cho subagent model nhẹ (`flash`).
  - Viết test TDD và chạy `scripts/verify-gate.mjs` 1 lệnh duy nhất thay vì sửa mò nhiều vòng.

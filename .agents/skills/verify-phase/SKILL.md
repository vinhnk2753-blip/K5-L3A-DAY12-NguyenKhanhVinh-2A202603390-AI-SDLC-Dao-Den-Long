---
name: verify-phase
description: Chạy kiểm chứng toàn diện cho Phase 2 (Contract v1.1): typecheck, build, unit/regression tests, scenario cho mọi tính năng mới, determinism 3 Đêm, benchmark 21.600 tick ≤ 30s và kiểm tra UI/FPS ≥ 30 ở 1280×720.
---

# Skill: Verify Phase (Phase 2 — Contract v1.1)

## Khi nào dùng
Chạy skill này sau mỗi thay đổi ở `src/sim/`, `src/cli/`, `src/game/`, `game.contract.json`, và **bắt buộc** ngay trước khi gắn tag `phase-2`.

## Các bước thực hiện
1. Chạy cổng kiểm chứng tự động (typecheck, build CLI+Web, toàn bộ Vitest gồm regression Phase 1 + Phase 2, kiểm tra `game.contract.json` v1.1, kiểm tra exit code 2, kiểm tra tính tất định Đêm 1/2/3, và benchmark Đêm 3 21.600 tick ≤ 30s):
   ```bash
   npm run verify
   ```
2. Chạy toàn bộ kịch bản headless cho từng tính năng mới của Phase 2 (`tests/scenarios/phase2/`) và lưu output JSONL thật vào `docs/proof/phase-2/`:
   - `dash-and-air.jsonl`
   - `fall-respawn.jsonl`
   - `night2-jumppad.jsonl`
   - `night3-ramps-wind.jsonl`
   - `drifter-steal-pulse.jsonl`
   - `wind-charm.jsonl`
   - `pause-resume.jsonl`
3. Kiểm chứng bản 3D trên trình duyệt ở độ phân giải `1280×720`:
   - Mở `npm run preview`, kiểm tra Menu chính → Intro Đêm (lời Ông Đăng) → Gameplay → Pause (`Esc`/`P`) → Cài đặt → HUD & bảng màu chuẩn.
   - Đo FPS trung bình (yêu cầu ≥ 30 FPS ở 1280×720) và chụp ảnh lưu vào `docs/proof/phase-2/`.
4. Điều phối subagent reviewer độc lập đọc mã nguồn + diff + bằng chứng và khắc phục mọi lỗi trước khi gắn tag `phase-2`.

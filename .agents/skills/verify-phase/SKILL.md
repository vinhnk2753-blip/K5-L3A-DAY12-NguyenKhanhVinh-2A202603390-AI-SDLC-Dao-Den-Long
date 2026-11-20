---
name: verify-phase
description: Chạy kiểm chứng toàn diện cho Phase 3 (Contract v1.2): typecheck, build, regression Phase 1–2 + unit/scenario Phase 3 (fuel, drain, dawn_survived, capacity), determinism 3 Đêm và benchmark trọn Đêm 3.
---

# Skill: Verify Phase (Phase 3 — Contract v1.2)

## Khi nào dùng
Chạy sau mỗi thay đổi ở `src/sim/`, `src/cli/`, `src/game/`, `game.contract.json`, và **bắt buộc** ngay trước khi gắn tag `phase-3`.

## Các bước thực hiện
1. Chạy cổng kiểm chứng tự động (typecheck, build CLI+Web, toàn bộ Vitest gồm regression Phase 1–2 + Phase 3, đồng bộ `game.contract.json` v1.2, exit code 2, determinism 3 Đêm, benchmark Đêm 3 18.000 tick ≤ 30 s):
   ```bash
   npm run verify
   ```
2. Chạy các kịch bản headless Phase 3 (`tests/scenarios/phase3/`) và lưu output JSONL thật vào `docs/proof/phase-3/`:
   - `fuel-refuel-relight.jsonl`
   - `shade-drain-pulse.jsonl`
   - `dawn-survived-win.jsonl`
   - `dynamic-capacity.jsonl`
3. Xác minh chế độ mù màu, thanh dầu, đèn tắt xẹp 20% + vết rách và HUD `carried/capacity` hoạt động sạch không lỗi.
4. Chạy subagent reviewer độc lập kiểm tra diff, ADR và bằng chứng trước khi gắn tag `phase-3`.

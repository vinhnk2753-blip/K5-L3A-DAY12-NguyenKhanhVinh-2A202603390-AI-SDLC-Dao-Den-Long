---
name: verify-phase
description: Chạy kiểm chứng toàn diện cho phase hiện tại (typecheck, build, unit tests, headless scenarios, determinism check) và xuất báo cáo bằng chứng thật vào docs/proof/.
---

# Skill: Verify Phase (Phase 1 — Contract v1.0)

## Khi nào dùng
Chạy skill này sau mỗi thay đổi lớn ở `src/sim/`, `src/cli/`, `game.contract.json`, và **bắt buộc** ngay trước khi gắn tag `phase-N`.

## Các bước thực hiện
1. Chạy typecheck và build sạch:
   ```bash
   npm run typecheck
   npm run build
   ```
2. Chạy toàn bộ unit test và contract test:
   ```bash
   npm test
   ```
3. Chạy cổng kiểm chứng tự động (chạy scenario headless, kiểm tra `game.contract.json` khớp code, kiểm tra mã thoát lỗi 2, kiểm tra tính tất định 2 lần chạy giống hệt nhau):
   ```bash
   npm run verify
   ```
4. Lưu log chạy thật (không chỉnh tay) vào `docs/proof/phase-1/`:
   - `verify-report.txt`: output trực tiếp từ `npm run verify`
   - `determinism-check.txt`: hash SHA-256 của 2 lần chạy cùng seed/scenario/inputs
   - Ảnh chụp màn hình game 3D đang chạy (HUD, đèn, đom đóm, Bóng Mực) kèm mô tả yêu cầu kiểm chứng.
5. Kiểm tra độc lập (reviewer riêng đọc diff và đối chiếu spec + bảng truy vết yêu cầu) trước khi gắn tag.

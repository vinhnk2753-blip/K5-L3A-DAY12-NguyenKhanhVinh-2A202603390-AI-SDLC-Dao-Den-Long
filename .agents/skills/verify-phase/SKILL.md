---
name: verify-phase
description: Chạy kiểm chứng phát hành Phase 4 (Contract v1.3): typecheck, build, toàn bộ regression + Phase 4 tests, determinism 3 Đêm, soak test 10 Đêm, benchmark 1280×720 và xuất leaderboard.
---

# Skill: Verify Phase (Phase 4 — Release v1.0.0 · Contract v1.3)

## Khi nào dùng
Chạy trước khi commit `bench.json` / `soak.json`, trước khi gắn tag `phase-4` và tạo Release `v1.0.0`.

## Các bước thực hiện
1. Chạy cổng kiểm chứng tự động (typecheck, build CLI+Web, toàn bộ Vitest gồm regression Phase 1–3 + Phase 4, đồng bộ Contract v1.3, determinism 3 Đêm, soak test 10 Đêm kiểm ngưỡng `crashes=0` & `mem_end_mb <= 1.2 * mem_start_mb`, xuất leaderboard, exit code 2):
   ```bash
   npm run verify
   ```
2. Chạy benchmark 3D chuẩn 30 giây ở 1280×720 và lưu `bench.json`:
   ```bash
   node dist-cli/cli/bench.js --seed 42 --duration 30 --out bench.json
   ```
3. Chạy soak test 10 Đêm và lưu `soak.json`:
   ```bash
   node dist-cli/cli/soak.js --seed 7 --nights 10 --out soak.json
   ```
4. Kiểm thử trên trình duyệt `1280×720`: Bảng xếp hạng cục bộ, đổi phím + phát hiện trùng phím, chế độ mù màu, chữ lớn ×1.25, giảm chuyển động, phụ đề hình ảnh, và chụp ảnh bằng chứng lưu vào `docs/proof/phase-4/`.
5. Thử clone sạch sang thư mục khác và chạy theo README tối đa 3 lệnh trước khi gắn tag `phase-4`.

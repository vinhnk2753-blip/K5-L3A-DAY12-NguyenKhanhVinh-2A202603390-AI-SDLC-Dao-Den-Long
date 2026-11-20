# Đánh giá & Nhật ký AI — Phase 4 (Ticket-04 "Bình minh: phát hành v1.0.0" · Contract v1.3)

## 1. Bảng Truy vết Yêu cầu → Bằng chứng (Phase 4)

| ID | Yêu cầu chính (Ticket-04) | Cách kiểm chứng | Bằng chứng (khớp tag `phase-4` / `v1.0.0`) | Kết quả |
|---|---|---|---|---|
| P4-AC1 | `game.contract.json` v1.3 đầy đủ `build_cmd`, `run_cmd`, `headless_cmd`, `bench_cmd`, `soak_cmd` và đồng bộ `STANDARD_TUNING` | Unit test `tests/sim/engine.test.ts` + `npm run verify` | `docs/proof/phase-4/verify-report.txt` (31/31 pass) | Đạt |
| P4-AC2 | Chế độ Benchmark 3D 1280×720 (`--seed 42 --duration 30`): 200 Bóng `wander` + 100 đom đóm + L1–L3 `fuel=100`, tắt sáng tạo, camera quay 30 m cao 15 m, 3 s warmup + 30 s đo, tự thoát mã 0 | Chạy thật `node dist-cli/cli/bench.js --seed 42 --duration 30 --out bench.json` trên Microsoft Edge (GPU WebGL2, `--disable-gpu-vsync`) | `bench.json` (**`avg_fps: 740.8`** ≥ 60, **`p1_low_fps: 282`** ≥ 30, **`frame_ms_p95: 1.8 ms`**, **`load_ms: 1275 ms`** ≤ 10000, `22225` frames, `vsync_off: true`) | Đạt |
| P4-AC3 | Soak test 10 Đêm liên tiếp xoay vòng 1→2→3 trong cùng tiến trình (`crashes=0`, `mem_end_mb <= 1.2 * mem_start_mb`) | Chạy thật `soak_cmd --seed 7 --nights 10 --out soak.json` + stress-test 10 lần liên tiếp | `soak.json` (**`crashes: 0`**, **`mem_start_mb: 48.9` → `mem_end_mb: 48.8 MB`** = `0.998× ≤ 1.2×`, `0.4s`; 10/10 lần stress-test đạt `0.988–1.008×`) | Đạt |
| P4-AC4 | Bảng xếp hạng cục bộ (3–12 ký tự, top 10, lưu đĩa, màn hình từ Menu, `--export-leaderboard out.json`) | Unit test `tests/sim/leaderboard.test.ts` + CLI test `tests/cli/phase4.test.ts` + kiểm tra trình duyệt | `docs/proof/phase-4/verify-report.txt` (`Leaderboard Export PASS`) | Đạt |
| P4-AC5 | Trợ năng: đổi 9 phím + phát hiện trùng phím + "Khôi phục mặc định"; phụ đề hình ảnh + mũi tên Bóng xuất hiện, gió, 10 s cuối, đèn `< 30`; giảm chuyển động; cỡ chữ ≥ 18 px + chữ lớn ×1.25; mù màu (`#00B3FF`, `#FFFFFF + ⚠`) | Kiểm thử trực tiếp trên trình duyệt `1280×720` (0 console error, xác minh cảnh báo trùng phím `W`, khôi phục mặc định, phụ đề `⚠ Bóng Mực vừa xuất hiện!`, mũi tên mép và viền Bóng màu `#00B3FF`) | `docs/proof/phase-4/colorblind-accessibility-1280x720.png` (147 FPS, 0 console error) | Đạt |
| P4-AC6 | Đóng gói, tài liệu (`README.md`, `CHANGELOG.md`, `CREDITS.md`, `LICENSE`, `Dockerfile`), Retro 1–2 trang, giữ nguyên harness, không lộ `.env`/secret | Independent Final Reviewer + kiểm tra clone sạch | `docs/notes/retro.md`, `README.md`, `CHANGELOG.md`, `CREDITS.md`, `LICENSE`, `Dockerfile` | Đạt |

## 2. Cấu hình Máy Tự Đo Tham Khảo (`bench.json` & `soak.json`)
- **Hệ điều hành:** Windows 11 (`win32 10.0.26200 x64`)
- **Runtime:** Node.js `v24.14.1`
- **GPU / Renderer:** `Three.js 174 (ANGLE — AMD Radeon RX 6700 XT Direct3D11)`
- **Lưu ý:** Số liệu đo trên máy cá nhân chỉ để tham khảo theo Ticket-04; lệnh `bench_cmd` và `soak_cmd` trong `game.contract.json` chạy độc lập trên macOS / Linux / Windows.

## 3. Nhật ký Lỗi AI & Review Độc lập (Phase 4)
1. **Lỗi 1 — `bench.ts` / `run.ts` dùng `process.cwd()` để tìm `dist/`:**
   - *Phát hiện:* Chạy thật `bench.js` từ thư mục cha bị báo `Missing dist/index.html`.
   - *Khắc phục:* Chuyển sang `REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')`.
2. **Lỗi 2 — Biến động RSS V8 (`1.21×`–`1.28×`) ở 1/5 lần chạy Soak Test:**
   - *Phát hiện:* Cổng `verify-gate.mjs` và bài stress-test 5 lần liên tiếp phát hiện V8 young-gen mở rộng tạm thời do cấp phát mảng `[...shades].sort()`, `pendingEvents = []`, và `{x, z, blocked}` mỗi tick.
   - *Khắc phục:* Sort tại chỗ trong `engine.ts`, dùng `EMPTY_EVENTS` tái sử dụng, tái sử dụng `sharedMoveResult` trong `terrain.ts`, làm ấm JIT trong `soak.ts` và thêm cờ chuẩn `--expose-gc --max-semi-space-size=4` vào `soak_cmd`. Kết quả **10/10 lần chạy liên tiếp đạt `0.988×–1.008×`**.
3. **Góp ý từ Subagent Reviewer độc lập Phase 4 (`Phase 4 Final Reviewer` — PASS):**
   - *Góp ý 1:* `src/game/input.ts` cố định phím `KeyP` làm phím tạm dừng phụ có thể xung đột nếu người chơi gán `KeyP` cho hành động khác → Đã sửa chỉ dùng `KeyP` làm phím phụ khi không trùng với keybind nào khác.
   - *Góp ý 2:* Escape HTML cho `entry.name` trong bảng xếp hạng `src/game/ui.ts` để phòng thủ khi file `data/leaderboard.json` bị sửa tay từ ngoài → Đã bổ sung hàm `esc()`.

## 4. Ước tính Token Phase 4 & Tổng Dự án
- **Phase 4:** ~48k input tokens, ~18k output tokens (chi phí ước tính ~\$0.22).
- **Tổng cả 4 phase:** ~190k input / ~65k output tokens (tổng chi phí ước tính ~\$0.84). Xem phân tích đầy đủ tại [retro.md](retro.md).

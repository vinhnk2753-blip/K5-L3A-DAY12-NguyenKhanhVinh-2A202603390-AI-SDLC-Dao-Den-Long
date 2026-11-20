# AGENTS.md — Đảo Đèn Lồng (Phase 4 · Contract v1.3 · v1.0.0)

## Lệnh cốt lõi
- Cài đặt & Build: `npm ci && npm run build`
- Chạy game + server bảng xếp hạng cục bộ: `node dist-cli/cli/run.js` (hoặc `npm start`)
- Xuất bảng xếp hạng: `node dist-cli/cli/run.js --export-leaderboard out.json`
- Chạy headless (Đêm 1/2/3): `node dist-cli/cli/headless.js --seed 42 --night 1 --ticks 14400 --out tmp/out.jsonl`
- Chạy benchmark 3D 1280×720: `node dist-cli/cli/bench.js --seed 42 --duration 30 --out bench.json`
- Chạy soak test 10 Đêm: `node dist-cli/cli/soak.js --seed 7 --nights 10 --out soak.json`
- Chạy cổng kiểm chứng đầy đủ (bắt buộc trước khi tag/release): `npm run verify`

## Kiến trúc & Bất biến bắt buộc
- `src/sim/` thuần TypeScript 60 tick/s (`DT = 1/60`), **CẤM** import `three`, DOM APIs, `Math.random()` hay `localeCompare`.
- `game.contract.json` (`v1.3`) phải khớp chính xác `STANDARD_TUNING` trong `src/sim/config.ts` và khai báo đủ `build_cmd`, `run_cmd`, `headless_cmd`, `bench_cmd`, `soak_cmd`.
- Nhiên liệu đèn tính nguyên bằng `fuelTicks` (`1/60` fuel); quy ước góc `(r cos α, r sin α)`; 12 bước/tick; 6 trạng thái Bóng Mực (`spawning/wander/chase/recoil/stunned/drain`).
- **Trong chế độ headless, soak và benchmark (`?bench=1`), toàn bộ yếu tố sáng tạo thêm phải tắt** để mọi bài chấm công bằng trên cùng một cảnh chuẩn.
- Cỡ chữ UI mặc định ≥ 18 px ở `1280×720`, hỗ trợ chữ lớn `×1.25`, chế độ mù màu, giảm chuyển động, phụ đề hình ảnh và đổi 9 phím có phát hiện trùng phím.

## Quy trình bắt buộc trước khi kết thúc / phát hành
1. Mọi logic mới (`leaderboard`, `soak`, `bench`, `keybinds`) đều có unit/integration test TDD trước khi chốt.
2. Chạy `npm run verify` (bao gồm typecheck, build, test, determinism 3 Đêm, soak test 10 Đêm, xuất leaderboard) — không gắn tag `phase-4` hay Release `v1.0.0` khi cổng đỏ.
3. Không sửa tay bất kỳ file `bench.json`, `soak.json` hay bằng chứng nào trong `docs/proof/`.

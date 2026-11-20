# AGENTS.md — Đảo Đèn Lồng (Phase 2 · Contract v1.1)

## Lệnh cốt lõi
- Cài đặt: `npm ci`
- Build (CLI headless + Web 3D): `npm run build`
- Typecheck: `npm run typecheck`
- Chạy test: `npm test`
- Chạy cổng kiểm chứng đầy đủ (bắt buộc trước khi tag): `npm run verify`
- Chạy game 3D: `npm run preview` (hoặc `npm run dev`)
- Chạy headless (Đêm 1 / 2 / 3): `node dist-cli/cli/headless.js --seed 42 --night 3 --ticks 21600 --out tmp/out.jsonl`

## Kiến trúc & Bất biến bắt buộc
- `src/sim/` là lõi mô phỏng thuần TypeScript, cố định **60 tick/giây** (`DT = 1/60`), quản lý toàn bộ 3 Đêm (`terrain.ts` + `engine.ts`).
- **CẤM** import `three`, DOM APIs, dùng `Math.random()`, hoặc `String.prototype.localeCompare` trong `src/sim/` và `src/cli/` (luôn dùng `src/sim/rng.ts` và so sánh mã ký tự `a < b ? -1 : a > b ? 1 : 0` để tất định 100% giữa Windows/macOS/Linux — bài học từ Phase 1 review).
- `game.contract.json` (`v1.1`) phải khớp chính xác `STANDARD_TUNING` trong `src/sim/config.ts` (được ép bởi unit test).
- Tuân thủ đúng **12 bước trong 1 tick** (Ticket-02): Input/Pause → Timers → Move/Fall → Pickup(Mote+Charm) → Interact → SafeZones → Pulse(3D) → Move(Shade+Drifter) → Contacts(Drifter trước, Shade sau) → Spawns → Win/Loss → Snapshot.
- Quy ước góc bản đồ: đo từ `+X`, `(x = r cos α, z = r sin α)` nên `α ∈ (0°, 180°)` có `z > 0` (khớp tầng 1 và 2 dốc 30°/150° của Đêm 3).
- Mọi yếu tố sáng tạo thêm và bảng màu/âm thanh chỉ nằm trong `src/game/` — **tuyệt đối không** đổi đầu ra headless.

## Quy ước Test Contract v1.1
- Hỗ trợ `--night 1`, `2`, `3`; sự kiện `night_start {night}` phát tại tick 0 sau snapshot tick 0.
- Trạng thái Bóng Mực bắt buộc dùng đúng 5 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Tọa độ và số đo thời gian làm tròn 3 chữ số thập phân (`round3`).
- File `--inputs` / `--scenario` sai JSON hoặc sai schema phải thoát mã **2** và báo lỗi ra `stderr`.
- Chạy trọn Đêm 3 (`21.600` tick) headless phải xong trong **≤ 30 giây**.

## Quy trình bắt buộc trước khi kết thúc / tag
1. TDD: viết test hoặc scenario thất bại trước khi thêm cơ chế mới; khi luật Phase 2 thay đổi test Phase 1, sửa kèm ghi chú lý do rõ ràng (không tắt âm thầm).
2. Chạy `npm run verify` — không kết thúc nếu typecheck, build, test, determinism hoặc benchmark 21.600 tick đỏ.
3. Không sửa tay bất kỳ file bằng chứng nào trong `docs/proof/`.

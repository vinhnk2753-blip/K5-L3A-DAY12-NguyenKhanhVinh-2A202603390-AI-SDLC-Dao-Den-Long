# AGENTS.md — Đảo Đèn Lồng (Phase 1)

## Lệnh cốt lõi
- Cài đặt: `npm ci`
- Build (CLI headless + Web 3D): `npm run build`
- Typecheck: `npm run typecheck`
- Chạy test: `npm test`
- Chạy cổng kiểm chứng đầy đủ (bắt buộc trước khi tag): `npm run verify`
- Chạy game 3D: `npm run preview` (hoặc `npm run dev`)
- Chạy headless: `node dist-cli/cli/headless.js --seed 42 --night 1 --ticks 600 --out tmp/out.jsonl`

## Kiến trúc bắt buộc
- `src/sim/` là lõi mô phỏng thuần TypeScript, cố định **60 tick/giây** (`DT = 1/60`).
- **CẤM** import `three`, `window`, `document` hoặc dùng `Math.random()` trong `src/sim/` và `src/cli/`. Mọi số ngẫu nhiên phải đi qua PRNG có seed (`src/sim/rng.ts`).
- `game.contract.json` là nguồn sự thật cho thông số `tuning`: mọi số trong `game.contract.json` phải khớp chính xác với `src/sim/config.ts` (được kiểm tra tự động bằng unit test).
- Mọi yếu tố sáng tạo thêm (hiệu ứng, cảnh trang trí, âm thanh) chỉ nằm ở `src/game/` — **tuyệt đối không** làm thay đổi đầu ra headless.

## Quy ước Test Contract v1.0
- Snapshot tick 0 ghi trước khi áp dụng input; bước `k` (`0..N-1`) tạo trạng thái và sự kiện tại `tick = k + 1`.
- Mọi khoảng cách trong `tuning` đo theo mặt phẳng XZ (`<= r`). Tọa độ làm tròn 3 chữ số thập phân.
- Lỗi cú pháp/schema trong `--inputs` hoặc `--scenario` phải thoát với mã **2** và ghi rõ ra `stderr`.
- Cùng `--seed`, `--scenario`, `--inputs` phải sinh ra JSONL giống hệt nhau từng byte giữa hai lần chạy.

## Quy trình trước khi hoàn thành tác vụ
1. Luôn viết test thất bại trước khi sửa logic (`src/sim/`).
2. Chạy `npm run verify` — không được kết thúc hay gắn tag nếu cổng kiểm chứng báo đỏ.
3. Không sửa tay bất kỳ file output bằng chứng nào trong `docs/proof/`.

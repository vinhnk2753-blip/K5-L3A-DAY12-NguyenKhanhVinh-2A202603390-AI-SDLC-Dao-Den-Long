# AGENTS.md — Đảo Đèn Lồng (Phase 3 · Contract v1.2)

## Lệnh cốt lõi
- Cài đặt: `npm ci`
- Build (CLI headless + Web 3D): `npm run build`
- Typecheck: `npm run typecheck`
- Chạy test: `npm test`
- Chạy cổng kiểm chứng đầy đủ (bắt buộc trước khi tag): `npm run verify`
- Chạy game 3D: `npm run preview` (hoặc `npm run dev`)
- Chạy headless (Đêm 1 / 2 / 3): `node dist-cli/cli/headless.js --seed 42 --night 1 --ticks 14400 --out tmp/out.jsonl`

## Kiến trúc & Bất biến bắt buộc
- `src/sim/` thuần TypeScript 60 tick/s (`DT = 1/60`), **CẤM** import `three`, DOM APIs, `Math.random()` hay `localeCompare`.
- `game.contract.json` (`v1.2`) phải khớp chính xác `STANDARD_TUNING` trong `src/sim/config.ts`.
- **Nhiên liệu đèn tính bằng số nguyên `fuelTicks` (đơn vị `1/60` fuel, max `6000`, ngưỡng yếu `1800`)** để loại sai số số thực; chỉ làm tròn 1 chữ số thập phân khi xuất snapshot/event.
- Thứ tự 12 bước/tick: Bước 2 trừ dầu (`1/60` tự hao + `5/60` mỗi Bóng `drain`) và tắt ngay đèn có `fuelTicks <= 0` (`lantern_out`); Bước 11 xét thắng/thua cuối tick (`no_flames` ưu tiên trước `dawn_survived` / `dawn`; **không còn `all_lit`**).
- Trạng thái Bóng Mực bắt buộc đúng 6 tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`. Hết choáng luôn về `wander`.
- Quy ước góc bản đồ: `(x = r cos α, z = r sin α)`.
- Chế độ mù màu và yếu tố sáng tạo chỉ nằm ở `src/game/` — tuyệt đối không làm đổi đầu ra headless.

## Quy trình bắt buộc trước khi kết thúc / tag
1. Khi yêu cầu thay đổi làm hỏng test cũ, cập nhật test kèm lý do rõ ràng (không skip âm thầm) và ghi ADR trong `docs/notes/`.
2. Chạy `npm run verify` — không kết thúc hay gắn tag nếu bất kỳ bước nào đỏ.
3. Không sửa tay bất kỳ file bằng chứng nào trong `docs/proof/`.

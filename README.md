# Đảo Đèn Lồng — Day 12 AI SDLC Lab (Phase 1)

Game 3D góc nhìn thứ ba xây dựng theo quy trình AI SDLC: điều khiển **Mây** (người giữ đèn đội nón lá treo đèn lồng) thu thập **Đom Đóm**, thắp sáng 5 **Đèn Lồng Lớn** trên **Đêm 1 – Đảo Bến**, và dùng **Tỏa Sáng** xua đuổi **Bóng Mực**.

## Cài đặt & Chạy (3 lệnh)

Yêu cầu: Node.js ≥ 18 (macOS / Linux / Windows).

```bash
npm ci
npm run build
npm run preview
```

Sau lệnh thứ 3, mở trình duyệt tại `http://127.0.0.1:4173`.

## Điều khiển
| Phím | Hành động |
|---|---|
| `W / A / S / D` | Di chuyển theo góc nhìn camera |
| `Space` | Nhảy |
| `E` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất |
| `Q` hoặc `F` | Tỏa Sáng (tốn 3 đom đóm, làm choáng & đẩy lùi Bóng Mực) |
| Giữ chuột trái + kéo hoặc `← / →` | Xoay camera |

## Cách tính điểm (Phase 1)
- `+10` mỗi đom đóm **nạp** vào đèn (không cộng lúc nhặt để tránh lặp lại nhặt–rơi).
- `+100` mỗi Đèn Lồng Lớn được thắp sáng (8 đom đóm/đèn).
- `+5` mỗi Bóng Mực trúng Tỏa Sáng.
- Thưởng khi thắng (`all_lit`): `+ floor(giây còn lại) × 2 + 50 × Ngọn Lửa còn lại`.

## Kiểm thử & Chế độ Headless (Test Contract v1.0)
- Chạy kiểm chứng đầy đủ (typecheck + build + unit/contract test + determinism):
  ```bash
  npm run verify
  ```
- Chạy chế độ headless trực tiếp:
  ```bash
  node dist-cli/cli/headless.js --seed 42 --night 1 --ticks 1200 --out tmp/out.jsonl --snapshot-every 10
  ```
- Khai báo thông số chuẩn: `game.contract.json` (`fall_enabled: false` ở Phase 1 vì PRD-0 chưa quy định cơ chế rơi khỏi đảo; ranh giới đảo tròn 40 m giữ nhân vật trên mặt đất).

## Sáng tạo của tôi
- **Đèn hoa đăng trôi trên biển mây & bầu trời sao cổ tích** cùng **cầu tàu gỗ Đảo Bến** và **đèn lồng nhỏ đung đưa trên vành nón lá của Mây** — tạo không khí đêm cổ tích ấm áp.
- Toàn bộ chi tiết sáng tạo chỉ nằm trong lớp đồ họa `src/game/scene.ts`, hoàn toàn tách biệt khỏi `src/sim/` và **không làm thay đổi bất kỳ giá trị đầu ra headless nào** (được xác minh qua `npm run verify` và kiểm tra tính tất định).

## Tài liệu & Bằng chứng SDLC
- Spec & giả định Phase 1: `docs/notes/phase-1-spec.md`
- Đánh giá, nhật ký lỗi AI & ước tính token Phase 1: `docs/notes/phase-1-eval.md`
- Bằng chứng chạy thật Phase 1: `docs/proof/phase-1/`
- Harness AI: `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `scripts/verify-gate.mjs`, `.github/workflows/ci.yml`
- Nguồn tài sản & bản quyền: `CREDITS.md`, `LICENSE`

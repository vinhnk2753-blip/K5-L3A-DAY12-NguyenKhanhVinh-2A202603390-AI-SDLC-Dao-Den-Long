# Đảo Đèn Lồng — Day 12 AI SDLC Lab (Phase 2 · Ba Hòn Đảo)

Game 3D góc nhìn thứ ba xây dựng qua quy trình AI SDLC: đồng hành cùng **Mây** (người giữ đèn đội nón lá treo đèn lồng) qua chuỗi **3 Đêm** — **Đảo Bến**, **Đảo Cau**, **Đảo Chuông** — thu thập **Đom Đóm**, thắp sáng toàn bộ **Đèn Lồng Lớn**, dùng **Lướt**, **Tỏa Sáng**, **Bùa Gió** để né **Bóng Mực**, **Gió Lạc** và đón Bình Minh.

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
| `W / A / S / D` | Di chuyển theo góc nhìn camera (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió) |
| `Space` | Nhảy (`7.0 m/s`) |
| `Shift` | Lướt / Dash (`14 m/s`, `0.2 s`, hồi `1.5 s`, giữ độ cao trên không) |
| `E` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (bán kính `2.0 m`, `10` đom đóm/đèn) |
| `Q` hoặc `F` | Tỏa Sáng (tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s` + đẩy `4 m`) |
| `Esc` hoặc `P` | Tạm dừng (đóng băng hoàn toàn logic) |
| Giữ chuột trái + kéo hoặc `← / →` | Xoay camera |

## Cách tính điểm (chuẩn hóa Phase 2)
- `+10` mỗi đom đóm **nạp** vào đèn.
- `+100` mỗi Đèn Lồng Lớn được thắp sáng (`10` đom đóm).
- `+5` mỗi Bóng Mực trúng Tỏa Sáng (mỗi con mỗi lần, kể cả đang choáng).
- Thưởng khi thắng mỗi Đêm (`all_lit`): `+ floor(giây còn lại) × 2 + 50 × Ngọn Lửa còn lại`.
- Tổng điểm hành trình là tổng điểm của cả 3 Đêm đã thắng.

## Kiểm thử & Chế độ Headless (Test Contract v1.1)
- Chạy cổng kiểm chứng đầy đủ (typecheck + build + 21 unit/regression/CLI tests + determinism 3 Đêm + benchmark 21.600 tick ≤ 30 s + exit code 2):
  ```bash
  npm run verify
  ```
- Chạy chế độ headless cho Đêm `1`, `2`, hoặc `3`:
  ```bash
  node dist-cli/cli/headless.js --seed 42 --night 3 --ticks 21600 --out tmp/night3.jsonl --snapshot-every 60
  ```
- Khai báo thông số chuẩn: `game.contract.json` (`contract_version: "1.1"`).

## Sáng tạo của tôi
- **Không khí đêm cổ tích sống động (thuần lớp hiển thị `src/game/`):**
  - Đèn hoa đăng vàng ấm trôi chầm chậm trên biển mây xa bờ và bầu trời sao.
  - Chi tiết kiến trúc đặc trưng từng đảo: cầu tàu gỗ Đảo Bến, nan tre trên cầu nối Đảo Cau, mái đỏ và chuông đồng vàng trên Tháp Chuông Đảo Chuông, vầng hào quang Bùa Gió quanh Mây và lá vàng cuốn theo hướng gió thực trên Đảo Chuông.
  - Nhạc nền ngũ cung dịu nhẹ và 14 hiệu ứng âm thanh tổng hợp 100% bằng Web Audio API (`src/game/audio.ts`) cùng lời dẫn của Ông Đăng mở đầu mỗi Đêm.
- **Đảm bảo không phá lõi & Test Contract:** Toàn bộ yếu tố sáng tạo nằm tách biệt trong `src/game/`, không import vào `src/sim/` hay `src/cli/`. Mọi test ẩn Phase 1 (regression), 7 kịch bản Phase 2 và kiểm tra tính tất định SHA-256 ở cả 3 Đêm đều xanh (`docs/proof/phase-2/verify-report.txt`).

## Tài liệu & Bằng chứng SDLC
- Spec, giả định & Acceptance Criteria: `docs/notes/phase-1-spec.md`, `docs/notes/phase-2-spec.md`
- Đánh giá, nhật ký lỗi AI & ước tính token: `docs/notes/phase-1-eval.md`, `docs/notes/phase-2-eval.md`
- Bằng chứng kiểm chứng khớp từng tag: `docs/proof/phase-1/`, `docs/proof/phase-2/`
- Harness AI: `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `scripts/verify-gate.mjs`, `.github/workflows/ci.yml`
- Nguồn tài sản & bản quyền: `CREDITS.md`, `LICENSE`

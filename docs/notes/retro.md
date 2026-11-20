# Retrospective — Day 12 AI SDLC: Đảo Đèn Lồng (v1.0.0)

**Học viên:** Nguyễn Khánh Vinh (`2A202603390`, lớp `L3A`)  
**Repository:** `K5-L3A-DAY12-NguyenKhanhVinh-2A202603390-AI-SDLC-Dao-Den-Long`  
**Stack:** TypeScript + Three.js + Vite + Vitest + Node.js CLI (Headless / Soak / Benchmark / Launcher)

---

## 1. Tổng hợp Đánh giá qua 4 Phase

| Phase | Tag | Contract | Phạm vi chính | Kết quả kiểm chứng | Thời lượng & Token ước tính |
|---|---|---|---|---|---|
| **Phase 1** | `phase-1` | v1.0 | Đêm 1 Đảo Bến, lõi 60 Hz thuần TS, headless CLI (`0/1/2`), game 3D + HUD, harness v1 (`AGENTS.md`, skill, gate, CI) | **14/14** test PASS, 5 scenario JSONL, SHA-256 tất định, Independent Review PASS (4 WARN đã sửa) | ~45k in / 14k out (~\$0.18) |
| **Phase 2** | `phase-2` | v1.1 | Chuẩn hóa số liệu & 12 bước/tick, chuỗi 3 Đêm (Đảo Bến / Đảo Cau / Đảo Chuông), Lướt, Gió Lạc, Bùa Gió, Gió mạnh, Pause, Cài đặt bền vững, Web Audio, bảng màu chuẩn | **21/21** test PASS (10/10 regression P1), 7 scenario Phase 2, trọn 21.600 tick `0.119s` (≤ 30s), 1280×720 đạt **156–180 FPS**, Independent Review PASS | ~65k in / 22k out (~\$0.30) |
| **Phase 3** | `phase-3` | v1.2 | Change Request phá vỡ luật: nhiên liệu đèn nguyên `1/60`, châm dầu, tắt/thắp lại (`5` đom đóm), Bóng hút dầu `drain`, thắng tại bình minh `dawn_survived` (bỏ `all_lit`), sức chứa `10..20`, chế độ mù màu, ADR-001 | **26/26** test PASS, 4 scenario Phase 3, SHA-256 3 Đêm khớp, trọn 18.000 tick `0.101s` | ~32k in / 11k out (~\$0.14) |
| **Phase 4** | `phase-4` / `v1.0.0` | v1.3 | Benchmark 3D 1280×720 (200 Bóng + 100 đom đóm `InstancedMesh`), Soak test 10 Đêm, Bảng xếp hạng cục bộ + `--export-leaderboard`, Trợ năng (đổi 9 phím + kiểm trùng, phụ đề + mũi tên, giảm chuyển động, chữ ≥ 18 px + ×1.25), Dockerfile, Retro | **31/31** test PASS, Soak 10 Đêm `0 crashes`, RSS `48.9 → 48.8 MB` (`0.998× ≤ 1.2×`, 10/10 lần stress-test ổn định `0.988–1.008×`) trong `0.4s`, Benchmark 3D đo thật **`740.8 FPS`**, `p1_low = 282 FPS`, `frame_ms_p95 = 1.8 ms`, `load_ms = 1275 ms` | ~48k in / 18k out (~\$0.22) |
| **Tổng** | 4 tags + `v1.0.0` | v1.0 → v1.3 | Toàn bộ sản phẩm, kiểm thử, đo đạc, tài liệu và harness AI | Toàn bộ cổng kiểm chứng & regression xanh 100% | **~190k in / 65k out (~\$0.84)** |

---

## 2. Điều Hiệu Quả và Không Hiệu Quả Khi Làm Cùng AI

### Hiệu quả nhất
1. **Tách lõi mô phỏng `src/sim/` hoàn toàn khỏi đồ họa `src/game/` ngay từ đầu:** Mọi nâng cấp lớn ở Phase 2 (3 bản đồ), Phase 3 (đổi toàn bộ mô hình đèn và luật thắng) và Phase 4 (Soak test 10 Đêm, InstancedMesh Benchmark) đều triển khai trơn tru, tốc độ headless đạt ~0.1s/Đêm và không bao giờ dính lỗi DOM/WebGL.
2. **TDD + Cổng tự động `scripts/verify-gate.mjs`:** Viết test thất bại trước rồi chạy 1 lệnh `npm run verify` giúp phát hiện lỗi biên dịch, lệch `game.contract.json`, và sai số tất định trong vòng vài giây.
3. **Subagent Reviewer độc lập (model nhẹ `flash`):** Phân tách người viết và người đánh giá giúp phát hiện lỗi thật (như `localeCompare` thiếu nhất quán đa nền tảng ở Phase 1 hay tie-breaking prompt ở `ui.ts` Phase 2) mà tốn rất ít token.
4. **Tính toán nhiên liệu bằng số nguyên `1/60` (`fuelTicks`):** Tránh triệt để sai số IEEE-754 khi trừ `1/60` và `5/60` qua 18.000 tick.

### Chưa hiệu quả / Khó khăn gặp phải
1. **Giãn nở bộ nhớ tạm (V8 young-gen) trong Soak Test ban đầu:** Lần chạy thử đầu tiên cho RSS `39.1 → 47.4 MB` (`1.21×`) và khi stress-test 5 lần vẫn có 1 lần vọt `1.28×` do V8 mở rộng semispace & copy mảng `[...shades].sort(...)` + tạo object `MoveResolveResult` mỗi tick. Tối ưu sort tại chỗ, tái sử dụng struct kết quả trong `terrain.ts`, loại bỏ tạo mảng rỗng `pendingEvents`, làm ấm JIT trước Đêm 1 và dùng cờ chuẩn `--expose-gc --max-semi-space-size=4` trong `soak_cmd` đã đưa **10/10 lần chạy liên tiếp** về mức **`0.988×–1.008×` (`48.9 → 48.8 MB`)**.
2. **Phụ thuộc `process.cwd()` trong CLI launcher:** `bench.js` và `run.js` ban đầu tìm `dist/` theo `process.cwd()`, bị lỗi ngay khi chạy từ thư mục cha. Sửa sang `import.meta.url` (`REPO_ROOT`) khắc phục triệt để.

---

## 3. Những Lần AI Sai & Cách Phát Hiện

| Phase | Lỗi AI mắc phải | Cách phát hiện | Hành động sửa & cập nhật Harness |
|---|---|---|---|
| Phase 1 | Tham số constructor `canvas` không dùng trong `scene.ts` (TS6138) | Cổng `npm run verify` (`tsc --noEmit`) | Xóa `private readonly` thừa |
| Phase 1 | Dùng `localeCompare` sắp xếp ID Bóng Mực (không đảm bảo đồng nhất ICU giữa Windows/macOS/Linux) và ép kiểu lỏng `scenario.shades[].id` | **Independent Reviewer subagent** | Thay bằng so sánh ASCII `< / >`, siết validation; **cập nhật `AGENTS.md` cấm `localeCompare` trong `src/sim/`** |
| Phase 2 | Nhầm dễ xảy ra ở góc bản đồ Đêm 3 (`z = -r sin α` vs `+r sin α`); Bóng Mực trong `safePushTicksLeft` vẫn di chuyển ngược ở Bước 8; gọi thừa `sim.step(false)` khi `onResume()` | Đối chiếu tọa độ thực tế trong Ticket-02 (`z > 0`, dốc 30°/150°) & tự rà 12 bước | Chốt quy tắc `(r cos α, r sin α)` vào `AGENTS.md`, bỏ di chuyển khi đang đẩy vùng an toàn, sửa `onResume()` |
| Phase 3 | Kịch bản `shade-drain-pulse` ban đầu đặt Mây trong 6 m nhưng chờ tick 65 mới Pulse (Bóng đã chuyển `chase`); import thừa `InputFrame` | Rà luật `drain → chase <= 6 m` & `npm run verify` | Tách 2 Bóng kiểm chứng đồng thời `+15đ` Pulse và `fuel_drain` 60 tick; xóa import thừa |
| Phase 4 | `soak.ts` tăng RSS `1.21×` do cấp phát mảng mỗi tick; `bench.ts`/`run.ts` dùng `process.cwd()` thay vì đường dẫn tương đối tới file build | Chạy thật `soak.js` và `bench.js` | Loại copy mảng mỗi tick trong `engine.ts`, tái dùng `input`, làm ấm JIT; chuyển sang `fileURLToPath(import.meta.url)` |

---

## 4. Harness AI Nào Giúp Nhiều Nhất?
1. **`scripts/verify-gate.mjs` (Hook/Gate — hữu ích số 1):** Ép buộc không thể kết thúc hay gắn tag khi `typecheck`, `build`, `vitest`, `game.contract.json` sync, determinism 3 Đêm, soak test hay exit code `2` bị lỗi. Khắc phục tận gốc thói quen "tưởng đã xong".
2. **`AGENTS.md` ngắn gọn (~30 dòng) tiến hóa qua 4 phase:** Giữ ngữ cảnh rẻ nhưng khóa chặt những bất biến dễ sai (cấm `localeCompare`, quy ước góc `(r cos α, r sin α)`, nhiên liệu nguyên `1/60`, tắt sáng tạo trong headless/bench).
3. **`.agents/skills/verify-phase/SKILL.md` + `.github/workflows/ci.yml`:** Chuẩn hóa quy trình sinh bằng chứng thật khớp tag và kiểm chứng tự động mỗi lần push.

---

## 5. Quản lý Token & Chi Phí
- **Tổng ước tính cả 4 phase:** ~190k input tokens, ~65k output tokens (tương đương ~\$0.80–\$0.95).
- **Chiến lược tiết kiệm:**
  - Giữ `AGENTS.md` dưới 35 dòng để không đốt ngữ cảnh ở mọi lượt.
  - Dùng subagent model nhẹ (`flash`) cho việc đọc Lab Board, kiểm thử trình duyệt và Independent Code Review.
  - Chia mô-đun nhỏ (`terrain.ts`, `validation.ts`, `leaderboard.ts`, `benchMode.ts`) để chỉ đọc/sửa đúng phạm vi cần thiết.
  - Tổng hợp mọi kiểm tra vào 1 lệnh `npm run verify` thay vì chạy rời rạc nhiều vòng.

---

## 6. Nếu Làm Lại Thì Đổi Gì?
1. **Ngay từ Checkpoint 0**, định nghĩa sẵn `REPO_ROOT` qua `import.meta.url` cho mọi CLI và thiết kế vòng lặp `step()` theo hướng ít cấp phát (in-place sort, tái dùng buffer) để không phải tối ưu lại ở Phase 4.
2. **Quay chụp ảnh UI/trình duyệt ngay ở mọi phase (`phase-1`…`phase-4`)** thay vì dồn sang Phase 2 & 4, giúp bảng bằng chứng mỗi tag đồng đều hơn.
3. **Viết thêm một bài test nhỏ kiểm tra cỡ chữ tối thiểu (computed `font-size >= 18px`)** ngay khi thêm UI để bảo vệ yêu cầu trợ năng tự động.

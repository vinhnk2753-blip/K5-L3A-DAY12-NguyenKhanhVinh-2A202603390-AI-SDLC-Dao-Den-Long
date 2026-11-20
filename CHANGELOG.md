# Changelog

## [v1.0.0 / Phase 4] - Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)
- **Chế độ Benchmark 3D (`bench_cmd`):** `node dist-cli/cli/bench.js --seed 42 --duration 30 --out bench.json` — dựng cảnh chuẩn Đêm 1 1280×720 không bật sáng tạo (200 Bóng Mực `wander` + 100 đom đóm bằng `THREE.InstancedMesh`, L1–L3 `fuel=100`, camera quay 30 m cao 15 m CCW 15 s/vòng, 3 s warmup + 30 s đo), xuất `bench.json` đầy đủ `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`.
- **Soak Test 10 Đêm (`soak_cmd`):** `node dist-cli/cli/soak.js --seed 7 --nights 10 --out soak.json` — chạy 10 Đêm liên tiếp 1→2→3 trong cùng 1 tiến trình, đo RSS trước/sau, xác minh `crashes = 0` và `mem_end_mb <= 1.2 * mem_start_mb`.
- **Bảng xếp hạng cục bộ & Xuất CLI:** Nhập tên `3–12` ký tự (hỗ trợ `[A-Za-z0-9_]` + tiếng Việt có dấu) sau Bình Minh hoặc khi thua, lưu đĩa Top 10 tại `data/leaderboard.json`, màn hình Bảng xếp hạng ở Menu chính, hỗ trợ `node dist-cli/cli/run.js --export-leaderboard out.json`.
- **Dễ tiếp cận (Accessibility):** Đổi đủ 9 phím điều khiển kèm phát hiện trùng phím & nút "Khôi phục mặc định"; phụ đề hình ảnh + mũi tên mép màn hình chỉ Bóng Mực vừa xuất hiện, gió sắp thổi, 10 s cuối, đèn `< 30%`; chế độ Giảm chuyển động (tắt rung camera & chớp đỏ); cỡ chữ UI tối thiểu `18 px` ở `1280×720` kèm tùy chọn chữ lớn `×1.25`.
- **Đóng gói phát hành v1.0.0:** `Dockerfile`, launcher `node dist-cli/cli/run.js`, `bench.json`, `soak.json`, `docs/notes/retro.md`, `README.md` hoàn chỉnh.

## [Phase 3] - Ticket-03 "Đèn cạn dầu" (Contract v1.2)
### Breaking Changes (Thay đổi phá vỡ tương thích)
- **Nhiên liệu đèn (`fuel`):** Đèn sáng hao `1.0/s` (đơn vị nguyên `1/60`), tối đa `100`, châm dầu `refuel` (`+10`/đom đóm); hết dầu tắt (`lantern_out`, `ever_lit = true`), thắp lại tốn `5` đom đóm (`relight_cost`).
- **Bóng Mực hút dầu (`drain`):** Đèn `fuel < 30` mất vùng an toàn; Bóng `wander` tìm đèn `< 30` hút `5/s` (`fuel_drain` mỗi 60 tick); hết choáng về `wander`.
- **Luật thắng mới (`dawn_survived`):** Bỏ thắng sớm `all_lit` và thưởng thời gian; thời lượng Đêm 1/2/3 đổi sang `240 / 270 / 300 s`; thắng khi sống tới bình minh với `>= ceil(0.6 × tổng đèn)` đèn sáng.
- **Điểm mới:** `+5`/đom đóm nạp/châm, `+100` thắp đầu, `+40` thắp lại, `+5`/`+15` Pulse (thường/`drain`), thưởng bình minh `+50 + floor(fuel)` mỗi đèn sáng + `+50`/Ngọn Lửa.

### Tính năng mới
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 × successful_lights)`.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** `#00B3FF` cho Bóng Mực, `#FFFFFF + ⚠` cho cảnh báo UI, đèn tắt xẹp 20% + vết rách giấy, thanh dầu & nhấp nháy 1 Hz khi `< 30`.
- Bổ sung [ADR-001](docs/notes/ADR-001-lantern-fuel-and-dawn-win.md).

## [Phase 2] - Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa toàn bộ số liệu, quy trình 12 bước/tick và mở rộng chuỗi **3 Đêm** (Đảo Bến, Đảo Cau cầu tre + bục nhảy, Đảo Chuông 3 tầng + 2 dốc + Tháp Chuông + gió mạnh).
- Bổ sung Lướt (Dash), Gió Lạc (Drifters), Bùa Gió (Wind Charms), Tạm dừng, Cài đặt bền vững, Web Audio BGM + 14 SFX, HUD + mũi tên chỉ đèn và bảng màu chuẩn.

## [Phase 1] - PRD-0 (Contract v1.0)
- Khởi tạo dự án TypeScript + Three.js + Vite + Vitest + Node headless CLI, lõi 60 Hz tất định, Đêm 1 Đảo Bến, harness AI và bằng chứng Phase 1.

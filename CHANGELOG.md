# Changelog

## [Phase 2] - Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa toàn bộ thông số vận tốc, vật lý, điểm số và quy trình 12 bước/tick theo Ticket-02 (`game.contract.json` v1.1).
- Mở rộng thành chuỗi **3 Đêm**:
  - **Đêm 1 — Đảo Bến**: đảo tròn 40 m, 5 đèn, 300 s, rơi khỏi đảo `Y < -10` hồi sinh sau 60 tick.
  - **Đêm 2 — Đảo Cau**: 2 đảo bán kính 28 m nối bằng cầu tre không lan can, 2 bục nhảy, 6 đèn, 330 s, Gió Lạc & Bùa Gió `C1`.
  - **Đêm 3 — Đảo Chuông**: đảo 3 tầng (`Y=0/3/6`), 2 dốc 30°/150°, bục nhảy lên tầng 2, Tháp Chuông bán kính 2 m, 7 đèn, 360 s, Bóng Mực 4.5 m/s, Gió Lạc, Bùa Gió `C1/C2` và cơn gió mạnh 2 m/s mỗi 30 s.
- Bổ sung kỹ năng **Lướt (Dash)** (`14 m/s`, `0.2 s`, hồi `1.5 s`, giữ độ cao khi lướt trên không), **Gió Lạc (Drifters)**, **Bùa Gió (Wind Charms)** và **Tạm dừng (Pause)** đóng băng hoàn toàn logic.
- Hoàn thiện trải nghiệm chơi: Menu chính, lời dẫn Ông Đăng, Màn hình Bình Minh, Menu tạm dừng (`Esc`/`P`), Cài đặt lưu bền vững (`localStorage`), nhạc nền + 14 hiệu ứng âm thanh Web Audio, bảng màu chuẩn 20 mã Hex, ánh sáng môi trường `0.15 + 0.55 × (đèn sáng / tổng đèn)` và HUD đầy đủ kèm mũi tên chỉ đèn ngoài màn hình.
- Nâng cấp harness AI (`AGENTS.md`, skill `verify-phase`, cổng `scripts/verify-gate.mjs` kiểm tra 3 Đêm + benchmark 21.600 tick ≤ 30 s) và bộ bằng chứng Phase 2.

## [Phase 1] - PRD-0 (Contract v1.0)
- Khởi tạo dự án TypeScript + Three.js + Vite + Vitest + Node headless CLI.
- Xây dựng lõi mô phỏng tất định 60 tick/s (`src/sim/`) tách biệt hoàn toàn với đồ họa 3D.
- Triển khai chế độ headless tuân thủ Test Contract v1.0 (`game.contract.json`, exit code `0/1/2`, JSONL output).
- Xây dựng bản chơi 3D Đêm 1 – Đảo Bến (5 Đèn Lồng Lớn, Mây đội nón lá treo đèn, Đom Đóm, Bóng Mực, Tỏa Sáng, HUD, màn thắng/thua & chơi lại).
- Thiết lập harness AI (`AGENTS.md`, skill `verify-phase`, `scripts/verify-gate.mjs`, GitHub Actions CI) và bộ bằng chứng Phase 1.

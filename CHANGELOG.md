# Changelog

## [Phase 1] - PRD-0 (Contract v1.0)
- Khởi tạo dự án TypeScript + Three.js + Vite + Vitest + Node headless CLI.
- Xây dựng lõi mô phỏng tất định 60 tick/s (`src/sim/`) tách biệt hoàn toàn với đồ họa 3D.
- Triển khai chế độ headless tuân thủ Test Contract v1.0 (`game.contract.json`, exit code `0/1/2`, JSONL output).
- Xây dựng bản chơi 3D Đêm 1 – Đảo Bến (5 Đèn Lồng Lớn, Mây đội nón lá treo đèn, Đom Đóm, Bóng Mực, Tỏa Sáng, HUD, màn thắng/thua & chơi lại).
- Thiết lập harness AI (`AGENTS.md`, skill `verify-phase`, `scripts/verify-gate.mjs`, GitHub Actions CI) và bộ bằng chứng Phase 1.

#!/usr/bin/env node
/**
 * Verification Gate Hook (Phase 4 — Release v1.0.0 · Contract v1.3)
 * Blocks completion/tagging if typecheck, build, tests, Contract v1.3 sync,
 * determinism (Nights 1-3), soak test (10 nights, 0 crashes, <=1.2x mem),
 * leaderboard export, or exit-code-2 check fails.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const tmpDir = path.join(root, 'tmp', 'verify-gate');
mkdirSync(tmpDir, { recursive: true });

function runStep(label, cmd) {
  console.log(`\n=== [GATE] ${label} ===`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

try {
  runStep('Typecheck', 'npm run typecheck');
  runStep('Build CLI + Web', 'npm run build');
  runStep('Unit, Regression & Phase 4 Contract Tests', 'npm test');

  console.log('\n=== [GATE] Contract v1.3, Determinism, Soak Test & Leaderboard Export ===');
  const contractPath = path.join(root, 'game.contract.json');
  if (!existsSync(contractPath)) throw new Error('Missing game.contract.json');
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  if (contract.contract_version !== '1.3' || !contract.bench_cmd || !contract.soak_cmd) {
    throw new Error('game.contract.json must be v1.3 with bench_cmd and soak_cmd');
  }

  const cliEntry = path.join(root, 'dist-cli', 'cli', 'headless.js');
  const soakEntry = path.join(root, 'dist-cli', 'cli', 'soak.js');
  const runEntry = path.join(root, 'dist-cli', 'cli', 'run.js');
  for (const f of [cliEntry, soakEntry, runEntry, path.join(root, 'dist-cli', 'cli', 'bench.js')]) {
    if (!existsSync(f)) throw new Error(`Missing compiled CLI: ${f}`);
  }

  for (const night of [1, 2, 3]) {
    const out1 = path.join(tmpDir, `det-n${night}-1.jsonl`);
    const out2 = path.join(tmpDir, `det-n${night}-2.jsonl`);
    const base = [cliEntry, '--seed', String(1000 + night), '--night', String(night), '--ticks', '1200', '--snapshot-every', '30'];
    execFileSync(process.execPath, [...base, '--out', out1], { cwd: root, stdio: 'pipe' });
    execFileSync(process.execPath, [...base, '--out', out2], { cwd: root, stdio: 'pipe' });
    const h1 = sha256(out1);
    const h2 = sha256(out2);
    if (h1 !== h2) throw new Error(`Determinism FAILED for night ${night}: ${h1} != ${h2}`);
    console.log(`Determinism PASS (night ${night}, 1200 ticks): SHA-256 = ${h1}`);
  }

  // Run Soak Test (10 nights)
  const soakOut = path.join(tmpDir, 'soak-gate.json');
  execFileSync(process.execPath, [soakEntry, '--seed', '7', '--nights', '10', '--out', soakOut], { cwd: root, stdio: 'pipe' });
  const soak = JSON.parse(readFileSync(soakOut, 'utf8'));
  if (soak.nights !== 10 || soak.crashes !== 0 || soak.mem_end_mb > soak.mem_start_mb * 1.2) {
    throw new Error(`Soak test FAILED: ${JSON.stringify(soak)}`);
  }
  console.log(
    `Soak Test PASS (10 nights, crashes=0, mem ${soak.mem_start_mb} -> ${soak.mem_end_mb} MB, ${soak.duration_s}s)`
  );

  // Verify --export-leaderboard
  const lbOut = path.join(tmpDir, 'lb-export.json');
  execFileSync(process.execPath, [runEntry, '--export-leaderboard', lbOut], { cwd: root, stdio: 'pipe' });
  const lb = JSON.parse(readFileSync(lbOut, 'utf8'));
  if (!Array.isArray(lb.entries)) throw new Error('Invalid leaderboard export format');
  console.log(`Leaderboard Export PASS (${lb.entries.length} entries)`);

  // Verify exit code 2 on malformed inputs
  const badInputPath = path.join(tmpDir, 'bad-inputs.json');
  writeFileSync(badInputPath, '{ invalid json', 'utf8');
  let badExitCode = 0;
  try {
    execFileSync(process.execPath, [cliEntry, '--seed', '1', '--night', '1', '--inputs', badInputPath, '--ticks', '10', '--out', path.join(tmpDir, 'bad.jsonl')], {
      cwd: root,
      stdio: 'pipe'
    });
  } catch (err) {
    badExitCode = err.status ?? 1;
  }
  if (badExitCode !== 2) throw new Error(`Expected exit code 2 for malformed inputs, got ${badExitCode}`);
  console.log('Malformed inputs exit-code check PASS (exit code 2)');

  console.log('\n[GATE PASSED] All Phase 4 v1.0.0 verification checks succeeded.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

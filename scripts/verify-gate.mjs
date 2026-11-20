#!/usr/bin/env node
/**
 * Verification Gate Hook (Phase 3 — Contract v1.2)
 * Blocks completion/tagging if typecheck, build, tests, contract v1.2 sync,
 * exit-code validation, determinism (Nights 1-3), or full-night benchmark (>30s) fails.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

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
  runStep('Unit, Regression & Contract Tests', 'npm test');

  console.log('\n=== [GATE] Contract v1.2, Multi-Night Determinism & Full-Night Benchmark ===');
  const contractPath = path.join(root, 'game.contract.json');
  if (!existsSync(contractPath)) throw new Error('Missing game.contract.json');
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  if (contract.contract_version !== '1.2') {
    throw new Error(`Expected contract_version 1.2, got ${contract.contract_version}`);
  }

  const cliEntry = path.join(root, 'dist-cli', 'cli', 'headless.js');
  if (!existsSync(cliEntry)) throw new Error('Missing compiled CLI at dist-cli/cli/headless.js');

  for (const night of [1, 2, 3]) {
    const out1 = path.join(tmpDir, `det-n${night}-1.jsonl`);
    const out2 = path.join(tmpDir, `det-n${night}-2.jsonl`);
    const base = [cliEntry, '--seed', String(1000 + night), '--night', String(night), '--ticks', '1200', '--snapshot-every', '30'];
    execFileSync(process.execPath, [...base, '--out', out1], { cwd: root, stdio: 'pipe' });
    execFileSync(process.execPath, [...base, '--out', out2], { cwd: root, stdio: 'pipe' });
    const h1 = sha256(out1);
    const h2 = sha256(out2);
    if (h1 !== h2) throw new Error(`Determinism FAILED for night ${night}: ${h1} != ${h2}`);
    const lines = readFileSync(out1, 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
    const snap0 = lines[0];
    if (
      snap0?.type !== 'snapshot' ||
      snap0?.tick !== 0 ||
      snap0?.night !== night ||
      typeof snap0?.player?.capacity !== 'number' ||
      typeof snap0?.lanterns?.[0]?.fuel !== 'number'
    ) {
      throw new Error(`Invalid v1.2 tick 0 snapshot on night ${night}`);
    }
    const last = lines[lines.length - 1];
    if (last?.type !== 'end') throw new Error(`Missing end record on night ${night}`);
    console.log(`Determinism PASS (night ${night}, 1200 ticks): SHA-256 = ${h1}`);
  }

  // Full Night 3 benchmark (300s = 18,000 ticks in Phase 3)
  const fullScen = path.join(tmpDir, 'full-18000.json');
  const fullOut = path.join(tmpDir, 'full-18000.jsonl');
  writeFileSync(fullScen, JSON.stringify({ random_shades: false, shades: [], random_drifters: false, drifters: [] }), 'utf8');
  const t1 = performance.now();
  execFileSync(process.execPath, [cliEntry, '--seed', '999', '--night', '3', '--scenario', fullScen, '--ticks', '18000', '--snapshot-every', '60', '--out', fullOut], {
    cwd: root,
    stdio: 'pipe'
  });
  const fullElapsedS = (performance.now() - t1) / 1000;
  const fullLines = readFileSync(fullOut, 'utf8').trim().split(/\r?\n/);
  const fullEnd = JSON.parse(fullLines[fullLines.length - 1]);
  console.log(`Benchmark Full Night 3 (18,000 ticks -> ${fullEnd.ticks} ticks, state=${fullEnd.state}): ${fullElapsedS.toFixed(3)}s (limit <= 30.000s)`);
  if (fullEnd.ticks !== 18000 || fullElapsedS > 30) {
    throw new Error(`Full Night 3 benchmark FAILED: ticks=${fullEnd.ticks}, time=${fullElapsedS.toFixed(3)}s`);
  }

  // Malformed inputs exit-code 2 check
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

  console.log('\n[GATE PASSED] All Phase 3 verification checks succeeded.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

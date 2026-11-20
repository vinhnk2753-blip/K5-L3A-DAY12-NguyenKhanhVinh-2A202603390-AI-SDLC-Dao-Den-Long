#!/usr/bin/env node
/**
 * Verification Gate Hook (Phase 2 — Contract v1.1)
 * Blocks completion/tagging if typecheck, build, tests, contract sync,
 * exit-code validation, determinism (Nights 1-3), or 21,600-tick benchmark (>30s) fails.
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

  console.log('\n=== [GATE] Contract v1.1, Multi-Night Determinism & Performance Benchmark ===');
  const contractPath = path.join(root, 'game.contract.json');
  if (!existsSync(contractPath)) throw new Error('Missing game.contract.json');
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  if (contract.contract_version !== '1.1') {
    throw new Error(`Expected contract_version 1.1, got ${contract.contract_version}`);
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
    if (h1 !== h2) {
      throw new Error(`Determinism FAILED for night ${night}: ${h1} != ${h2}`);
    }
    const lines = readFileSync(out1, 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
    if (lines[0]?.type !== 'snapshot' || lines[0]?.tick !== 0 || lines[0]?.night !== night) {
      throw new Error(`Invalid tick 0 snapshot on night ${night}`);
    }
    const last = lines[lines.length - 1];
    if (last?.type !== 'end') {
      throw new Error(`Missing end record on night ${night}`);
    }
    console.log(`Determinism PASS (night ${night}, 1200 ticks): SHA-256 = ${h1}`);
  }

  // Full Night 3 benchmark: 21,600 ticks must finish in <= 30s
  const benchOut = path.join(tmpDir, 'bench-n3.jsonl');
  const t0 = performance.now();
  execFileSync(process.execPath, [cliEntry, '--seed', '2026', '--night', '3', '--ticks', '21600', '--snapshot-every', '60', '--out', benchOut], {
    cwd: root,
    stdio: 'pipe'
  });
  const elapsedS = (performance.now() - t0) / 1000;
  const benchLines = readFileSync(benchOut, 'utf8').trim().split(/\r?\n/);
  const benchEnd = JSON.parse(benchLines[benchLines.length - 1]);
  console.log(`Benchmark Night 3 (21,600 max ticks -> ran ${benchEnd.ticks} ticks, state=${benchEnd.state}): ${elapsedS.toFixed(3)}s (limit <= 30.000s)`);
  if (elapsedS > 30) {
    throw new Error(`Performance FAILED: ${elapsedS.toFixed(3)}s > 30s`);
  }

  // Also benchmark a guaranteed full 21,600 ticks (no shades so it runs all 21,600 steps to dawn)
  const fullScen = path.join(tmpDir, 'full-21600.json');
  const fullOut = path.join(tmpDir, 'full-21600.jsonl');
  writeFileSync(fullScen, JSON.stringify({ random_shades: false, shades: [], random_drifters: false, drifters: [] }), 'utf8');
  const t1 = performance.now();
  execFileSync(process.execPath, [cliEntry, '--seed', '999', '--night', '3', '--scenario', fullScen, '--ticks', '21600', '--snapshot-every', '60', '--out', fullOut], {
    cwd: root,
    stdio: 'pipe'
  });
  const fullElapsedS = (performance.now() - t1) / 1000;
  const fullLines = readFileSync(fullOut, 'utf8').trim().split(/\r?\n/);
  const fullEnd = JSON.parse(fullLines[fullLines.length - 1]);
  console.log(`Benchmark Full 21,600 Ticks (night 3 -> ${fullEnd.ticks} ticks, state=${fullEnd.state}): ${fullElapsedS.toFixed(3)}s (limit <= 30.000s)`);
  if (fullEnd.ticks !== 21600 || fullElapsedS > 30) {
    throw new Error(`Full 21,600-tick benchmark FAILED: ticks=${fullEnd.ticks}, time=${fullElapsedS.toFixed(3)}s`);
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
  if (badExitCode !== 2) {
    throw new Error(`Expected exit code 2 for malformed inputs, got ${badExitCode}`);
  }
  console.log('Malformed inputs exit-code check PASS (exit code 2)');

  console.log('\n[GATE PASSED] All Phase 2 verification checks succeeded.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

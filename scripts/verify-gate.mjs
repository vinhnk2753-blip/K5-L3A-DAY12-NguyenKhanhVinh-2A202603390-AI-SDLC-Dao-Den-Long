#!/usr/bin/env node
/**
 * Verification Gate Hook (Phase 1+)
 * Blocks completion/tagging if typecheck, build, tests, contract sync,
 * exit-code validation, or determinism check fails.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
  runStep('Unit & Contract Tests', 'npm test');

  console.log('\n=== [GATE] Contract JSON & Headless Determinism Check ===');
  const contractPath = path.join(root, 'game.contract.json');
  if (!existsSync(contractPath)) {
    throw new Error('Missing game.contract.json');
  }
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  if (!contract.contract_version || !contract.headless_cmd || !contract.tuning) {
    throw new Error('Invalid game.contract.json structure');
  }

  const cliEntry = path.join(root, 'dist-cli', 'cli', 'headless.js');
  if (!existsSync(cliEntry)) {
    throw new Error('Missing compiled CLI at dist-cli/cli/headless.js');
  }

  const out1 = path.join(tmpDir, 'det-run1.jsonl');
  const out2 = path.join(tmpDir, 'det-run2.jsonl');
  const argsBase = [cliEntry, '--seed', '1337', '--night', '1', '--ticks', '1200', '--snapshot-every', '20'];

  execFileSync(process.execPath, [...argsBase, '--out', out1], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, [...argsBase, '--out', out2], { cwd: root, stdio: 'pipe' });

  const h1 = sha256(out1);
  const h2 = sha256(out2);
  if (h1 !== h2) {
    throw new Error(`Determinism FAILED: run1=${h1} != run2=${h2}`);
  }
  console.log(`Determinism PASS (night 1, 1200 ticks): SHA-256 = ${h1}`);

  // Verify JSONL well-formedness & final "end" line
  const lines = readFileSync(out1, 'utf8').trim().split(/\r?\n/);
  const parsed = lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Malformed JSONL on line ${idx + 1}`);
    }
  });
  if (parsed[0]?.type !== 'snapshot' || parsed[0]?.tick !== 0) {
    throw new Error('First JSONL line must be tick 0 snapshot');
  }
  const last = parsed[parsed.length - 1];
  if (last?.type !== 'end' || typeof last.ticks !== 'number' || !['playing', 'won', 'lost'].includes(last.state)) {
    throw new Error(`Invalid end line: ${JSON.stringify(last)}`);
  }
  console.log(`JSONL Structure PASS (${lines.length} lines, final state=${last.state}, ticks=${last.ticks}, score=${last.score})`);

  // Verify exit code 2 on malformed inputs file
  const badInputPath = path.join(tmpDir, 'bad-inputs.json');
  const { writeFileSync } = await import('node:fs');
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

  console.log('\n[GATE PASSED] All verification checks succeeded.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

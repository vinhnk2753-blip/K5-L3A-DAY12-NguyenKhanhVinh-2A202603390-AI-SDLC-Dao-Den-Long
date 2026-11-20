import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runSimulation } from '../sim/engine.js';
import type { InputsFile, NightNumber, ScenarioConfig } from '../sim/types.js';
import { ContractValidationError, validateInputs, validateScenario } from '../sim/validation.js';

interface CliArgs {
  seed: number;
  night: NightNumber;
  scenarioPath?: string;
  inputsPath?: string;
  ticks: number;
  outPath: string;
  snapshotEvery: number;
}

function parseIntArg(flag: string, value: string | undefined): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer for ${flag}: "${value ?? ''}"`);
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Out-of-range integer for ${flag}: "${value}"`);
  }
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let night: number | undefined;
  let scenarioPath: string | undefined;
  let inputsPath: string | undefined;
  let ticks: number | undefined;
  let outPath: string | undefined;
  let snapshotEvery = 10;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntArg('--seed', argv[++i]);
        break;
      case '--night':
        night = parseIntArg('--night', argv[++i]);
        break;
      case '--scenario':
        scenarioPath = argv[++i];
        if (!scenarioPath || scenarioPath.startsWith('--')) throw new Error('Missing path for --scenario');
        break;
      case '--inputs':
        inputsPath = argv[++i];
        if (!inputsPath || inputsPath.startsWith('--')) throw new Error('Missing path for --inputs');
        break;
      case '--ticks':
        ticks = parseIntArg('--ticks', argv[++i]);
        break;
      case '--out':
        outPath = argv[++i];
        if (!outPath || outPath.startsWith('--')) throw new Error('Missing path for --out');
        break;
      case '--snapshot-every':
        snapshotEvery = parseIntArg('--snapshot-every', argv[++i]);
        break;
      default:
        throw new Error(`Unknown CLI argument: "${arg}"`);
    }
  }

  if (seed === undefined) throw new Error('Missing required --seed');
  if (night === undefined) throw new Error('Missing required --night');
  if (night !== 1 && night !== 2 && night !== 3) {
    throw new Error(`Invalid --night ${night}: Contract v1.1 supports nights 1, 2, or 3`);
  }
  if (ticks === undefined || ticks < 0) throw new Error('Missing or negative --ticks');
  if (!outPath) throw new Error('Missing required --out');
  if (snapshotEvery <= 0) throw new Error('--snapshot-every must be > 0');

  return { seed, night, scenarioPath, inputsPath, ticks, outPath, snapshotEvery };
}

function readJsonChecked(filePath: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${filePath}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ContractValidationError(`Malformed JSON in ${label} file "${filePath}": ${(err as Error).message}`);
  }
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));

    let scenario: ScenarioConfig | undefined;
    if (args.scenarioPath) {
      scenario = validateScenario(readJsonChecked(args.scenarioPath, 'scenario'));
    }

    let inputs: InputsFile | undefined;
    if (args.inputsPath) {
      inputs = validateInputs(readJsonChecked(args.inputsPath, 'inputs'));
    }

    const result = runSimulation({
      seed: args.seed,
      night: args.night,
      scenario,
      inputs,
      ticks: args.ticks,
      snapshotEvery: args.snapshotEvery
    });

    const outDir = path.dirname(path.resolve(args.outPath));
    mkdirSync(outDir, { recursive: true });
    const content = result.records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(args.outPath, content, 'utf8');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    if (err instanceof ContractValidationError) {
      process.exit(2);
    }
    process.exit(1);
  }
}

main();

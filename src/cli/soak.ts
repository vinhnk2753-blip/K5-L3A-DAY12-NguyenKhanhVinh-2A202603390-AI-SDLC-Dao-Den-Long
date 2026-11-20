import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { NIGHT_MAPS, TICK_RATE } from '../sim/config.js';
import { createSimulation } from '../sim/engine.js';
import { createRng, round1 } from '../sim/rng.js';
import type { LiveInputState, NightNumber } from '../sim/types.js';

interface SoakArgs {
  seed: number;
  nights: number;
  outPath: string;
}

function parseIntArg(flag: string, value: string | undefined): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer for ${flag}: "${value ?? ''}"`);
  }
  return Number.parseInt(value, 10);
}

function parseArgs(argv: string[]): SoakArgs {
  let seed = 7;
  let nights = 10;
  let outPath = 'soak.json';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntArg('--seed', argv[++i]);
        break;
      case '--nights':
        nights = parseIntArg('--nights', argv[++i]);
        break;
      case '--out':
        outPath = argv[++i];
        if (!outPath || outPath.startsWith('--')) throw new Error('Missing path for --out');
        break;
      default:
        throw new Error(`Unknown argument: "${arg}"`);
    }
  }

  if (nights <= 0) throw new Error('--nights must be > 0');
  return { seed, nights, outPath };
}

function rssMb(): number {
  return round1(process.memoryUsage().rss / (1024 * 1024));
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    // Warm up V8 JIT & young-gen heap across all 3 nights so RSS measures true leak stability
    {
      const warmInput: LiveInputState = {
        move: [1, 0],
        cam_yaw_deg: 0,
        jump: false,
        dash: false,
        pulse: false,
        interact: false,
        pause: false
      };
      for (const wn of [1, 2, 3] as NightNumber[]) {
        const warm = createSimulation({ seed: 100 + wn, night: wn });
        for (let w = 0; w < 600; w++) {
          warmInput.jump = w % 20 === 0;
          warmInput.dash = w % 35 === 0;
          warmInput.interact = w % 10 === 0;
          warm.step(warmInput);
        }
      }
    }

    const t0 = performance.now();
    const results: Array<'won' | 'lost'> = [];
    let crashes = 0;
    let memStartMb = 0;
    const input: LiveInputState = {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      dash: false,
      pulse: false,
      interact: false,
      pause: false
    };

    for (let i = 0; i < args.nights; i++) {
      const night = ((i % 3) + 1) as NightNumber;
      const nightSeed = args.seed + i;
      const maxTicks = NIGHT_MAPS[night].durationS * TICK_RATE;

      try {
        let sim: ReturnType<typeof createSimulation> | null = createSimulation({ seed: nightSeed, night });
        if (i === 0) {
          memStartMb = rssMb();
        }

        const inputRng = createRng((nightSeed ^ 0x9e3779b9) >>> 0);

        for (let t = 0; t < maxTicks; t++) {
          if (sim.getState() === 'won' || sim.getState() === 'lost') break;

          if (t % 30 === 0) {
            const angle = inputRng.range(0, Math.PI * 2);
            const mag = inputRng.next() < 0.1 ? 0 : 1;
            input.move[0] = Math.cos(angle) * mag;
            input.move[1] = Math.sin(angle) * mag;
            input.cam_yaw_deg = inputRng.range(0, 360);
          }

          input.jump = inputRng.next() < 0.05;
          input.dash = inputRng.next() < 0.03;
          input.pulse = inputRng.next() < 0.02;
          input.interact = inputRng.next() < 0.1;
          input.pause = false;

          sim.step(input);
        }

        const st = sim.getState();
        results.push(st === 'won' ? 'won' : 'lost');
        sim = null;
      } catch (err) {
        crashes += 1;
        results.push('lost');
        process.stderr.write(`Night ${i + 1} (seed ${nightSeed}) crashed: ${(err as Error).message}\n`);
      }
    }

    const memEndMb = rssMb();
    const durationS = round1((performance.now() - t0) / 1000);

    const report = {
      nights: args.nights,
      crashes,
      results,
      mem_start_mb: memStartMb,
      mem_end_mb: memEndMb,
      duration_s: durationS
    };

    const outDir = path.dirname(path.resolve(args.outPath));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(args.outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    process.exit(crashes === 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();

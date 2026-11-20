import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { computeBenchMetrics } from '../sim/leaderboard.js';
import { round1 } from '../sim/rng.js';

const PROCESS_START_MS = performance.now();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

interface BenchArgs {
  seed: number;
  duration: number;
  outPath: string;
}

function parseArgs(argv: string[]): BenchArgs {
  let seed = 42;
  let duration = 30;
  let outPath = 'bench.json';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed') seed = Number.parseInt(argv[++i] ?? '42', 10);
    else if (arg === '--duration') duration = Number.parseFloat(argv[++i] ?? '30');
    else if (arg === '--out') outPath = argv[++i] ?? 'bench.json';
    else throw new Error(`Unknown argument: "${arg}"`);
  }
  if (!Number.isSafeInteger(seed)) throw new Error('Invalid --seed');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid --duration');
  return { seed, duration, outPath };
}

function findBrowserExecutable(): string | null {
  if (process.env.BENCH_BROWSER && existsSync(process.env.BENCH_BROWSER)) return process.env.BENCH_BROWSER;
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const platform = os.platform();
  const candidates: string[] = [];

  if (platform === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const local = process.env.LocalAppData ?? '';
    candidates.push(
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    );
  } else {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try {
        const found = execFileSync('which', [bin], { stdio: 'pipe' }).toString('utf8').trim();
        if (found) return found;
      } catch {
        // continue
      }
    }
  }

  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function sampleBrowserTreeRssMb(rootPid: number): number | null {
  try {
    if (os.platform() === 'win32') {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$p=Get-CimInstance Win32_Process; $ids=@(${rootPid}); $changed=$true; while($changed){$changed=$false; foreach($x in $p){if(($ids -contains $x.ParentProcessId) -and -not ($ids -contains $x.ProcessId)){$ids+=$x.ProcessId;$changed=$true}}}; ($p | Where-Object {$ids -contains $_.ProcessId} | Measure-Object WorkingSetSize -Sum).Sum`
        ],
        { stdio: 'pipe', timeout: 2500 }
      )
        .toString('utf8')
        .trim();
      const bytes = Number.parseFloat(out);
      return Number.isFinite(bytes) && bytes > 0 ? round1(bytes / (1024 * 1024)) : null;
    } else {
      const out = execFileSync('ps', ['-o', 'rss=', '-p', String(rootPid)], { stdio: 'pipe', timeout: 1500 })
        .toString('utf8')
        .trim();
      const kb = Number.parseFloat(out);
      return Number.isFinite(kb) && kb > 0 ? round1(kb / 1024) : null;
    }
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(process.cwd(), 'dist');
  if (!existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Missing dist/index.html. Run "npm run build" first.');
  }

  const browserBin = findBrowserExecutable();
  if (!browserBin) {
    throw new Error('No Chromium/Chrome/Edge executable found. Set BENCH_BROWSER=/path/to/chrome.');
  }

  let loadMs = 0;
  let peakMemMb: number | null = null;
  let browserChild: ReturnType<typeof spawn> | null = null;
  let memPoller: ReturnType<typeof setInterval> | null = null;
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'dao-den-long-bench-'));

  let resolveDone!: (payload: { dts: number[]; renderer: string }) => void;
  let rejectDone!: (err: Error) => void;
  const donePromise = new Promise<{ dts: number[]; renderer: string }>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    if (urlPath === '/bench-first-frame' && req.method === 'POST') {
      if (loadMs === 0) {
        loadMs = Math.round(performance.now() - PROCESS_START_MS);
      }
      res.statusCode = 200;
      res.end('ok');
      return;
    }
    if (urlPath === '/bench-done' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += String(chunk);
      });
      req.on('end', () => {
        res.statusCode = 200;
        res.end('ok');
        try {
          const parsed = JSON.parse(body) as { dts: number[]; renderer: string };
          resolveDone(parsed);
        } catch (err) {
          rejectDone(err as Error);
        }
      });
      return;
    }

    const safeRel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '').replace(/\.\./g, '');
    const filePath = path.join(distDir, safeRel);
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
    res.end(readFileSync(filePath));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to bind local benchmark server');

  const url = `http://127.0.0.1:${addr.port}/?bench=1&seed=${args.seed}&duration=${args.duration}`;
  const browserArgs = [
    `--app=${url}`,
    '--window-size=1280,720',
    '--window-position=40,40',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${userDataDir}`
  ];

  browserChild = spawn(browserBin, browserArgs, { stdio: 'ignore' });
  const pid = browserChild.pid;

  if (pid) {
    memPoller = setInterval(() => {
      const m = sampleBrowserTreeRssMb(pid);
      if (m !== null) {
        peakMemMb = peakMemMb === null ? m : Math.max(peakMemMb, m);
      }
    }, 3000);
  }

  const timeoutHandle = setTimeout(() => {
    rejectDone(new Error(`Benchmark timed out after ${args.duration + 35}s`));
  }, (args.duration + 35) * 1000);

  try {
    const payload = await donePromise;
    clearTimeout(timeoutHandle);
    if (memPoller) clearInterval(memPoller);

    if (pid && peakMemMb === null) {
      peakMemMb = sampleBrowserTreeRssMb(pid);
    }

    const metrics = computeBenchMetrics(payload.dts);
    const result = {
      contract_version: '1.3',
      avg_fps: metrics.avg_fps,
      p1_low_fps: metrics.p1_low_fps,
      frame_ms_p95: metrics.frame_ms_p95,
      frames: metrics.frames,
      load_ms: loadMs,
      peak_mem_mb: peakMemMb,
      vsync_off: true,
      renderer: payload.renderer,
      os: `${os.platform()} ${os.release()} (${os.arch()})`
    };

    mkdirSync(path.dirname(path.resolve(args.outPath)), { recursive: true });
    writeFileSync(args.outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (memPoller) clearInterval(memPoller);
    clearTimeout(timeoutHandle);
    if (browserChild && !browserChild.killed) {
      try {
        if (os.platform() === 'win32' && browserChild.pid) {
          execFileSync('taskkill', ['/PID', String(browserChild.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          browserChild.kill('SIGTERM');
        }
      } catch {
        // ignore cleanup errors
      }
    }
    server.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore locked temp profile on Windows
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`Benchmark Error: ${(err as Error).message}\n`);
    process.exit(1);
  });

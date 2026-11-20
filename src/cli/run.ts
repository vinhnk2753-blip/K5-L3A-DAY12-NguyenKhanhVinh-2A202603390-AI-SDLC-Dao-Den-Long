import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { addLeaderboardEntry, formatIsoWithLocalOffset, type LeaderboardEntry, type LeaderboardFile, sortLeaderboard } from '../sim/leaderboard.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getLeaderboardPath(): string {
  if (process.env.DAO_DEN_LONG_LEADERBOARD_PATH) {
    return path.resolve(process.env.DAO_DEN_LONG_LEADERBOARD_PATH);
  }
  return path.resolve(process.cwd(), 'data', 'leaderboard.json');
}

function readLeaderboardFile(filePath: string): LeaderboardFile {
  if (!existsSync(filePath)) return { entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<LeaderboardFile>;
    const list = Array.isArray(parsed.entries) ? (parsed.entries as LeaderboardEntry[]) : [];
    return { entries: sortLeaderboard(list) };
  } catch {
    return { entries: [] };
  }
}

function writeLeaderboardFile(filePath: string, data: LeaderboardFile): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ entries: sortLeaderboard(data.entries) }, null, 2) + '\n', 'utf8');
}

function main(): void {
  const argv = process.argv.slice(2);
  let exportPath: string | undefined;
  let host = '127.0.0.1';
  let port = 4173;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--export-leaderboard') {
      exportPath = argv[++i];
      if (!exportPath || exportPath.startsWith('--')) {
        process.stderr.write('Error: Missing output path for --export-leaderboard\n');
        process.exit(1);
      }
    } else if (arg === '--host') {
      host = argv[++i] ?? host;
    } else if (arg === '--port') {
      port = Number.parseInt(argv[++i] ?? '4173', 10);
    }
  }

  const lbPath = getLeaderboardPath();

  if (exportPath) {
    const lb = readLeaderboardFile(lbPath);
    mkdirSync(path.dirname(path.resolve(exportPath)), { recursive: true });
    writeFileSync(exportPath, JSON.stringify(lb, null, 2) + '\n', 'utf8');
    process.exit(0);
  }

  const distDir = path.resolve(process.cwd(), 'dist');
  if (!existsSync(path.join(distDir, 'index.html'))) {
    process.stderr.write('Error: dist/index.html not found. Run "npm run build" first.\n');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (urlPath === '/api/leaderboard') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'GET') {
        res.end(JSON.stringify(readLeaderboardFile(lbPath)));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += String(chunk);
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as Partial<LeaderboardEntry>;
            const current = readLeaderboardFile(lbPath);
            const updated = addLeaderboardEntry(current.entries, {
              name: String(payload.name ?? ''),
              score: Number(payload.score ?? 0),
              nights_won: Number(payload.nights_won ?? 0),
              achieved_at: typeof payload.achieved_at === 'string' ? payload.achieved_at : formatIsoWithLocalOffset(),
              seed: Number(payload.seed ?? 0)
            });
            writeLeaderboardFile(lbPath, { entries: updated });
            res.statusCode = 200;
            res.end(JSON.stringify({ entries: updated }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
        return;
      }
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

  server.listen(port, host, () => {
    console.log(`Đảo Đèn Lồng v1.0.0 running at http://${host}:${port}/`);
    console.log(`Leaderboard disk store: ${lbPath}`);
  });
}

main();

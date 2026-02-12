import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  port: number;
  dbPath: string;
  scanRoots: string[];
  scanMaxDepth: number;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3847', 10),
    dbPath:
      process.env['DB_PATH'] ??
      join(homedir(), '.config', 'agent-code-reviewer', 'db', 'reviewer.db'),
    scanRoots: (process.env['SCAN_ROOTS'] ?? homedir())
      .split(',')
      .map((s) => s.trim()),
    scanMaxDepth: parseInt(process.env['SCAN_MAX_DEPTH'] ?? '3', 10),
  };
}

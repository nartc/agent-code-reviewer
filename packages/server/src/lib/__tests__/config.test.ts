import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore original env
        process.env = { ...originalEnv };
    });

    it('returns default values when no env vars set', () => {
        delete process.env['PORT'];
        delete process.env['DB_PATH'];
        delete process.env['SCAN_ROOTS'];
        delete process.env['SCAN_MAX_DEPTH'];

        const config = loadConfig();

        expect(config.port).toBe(3847);
        expect(config.dbPath).toBe(join(homedir(), '.config', 'agent-code-reviewer', 'db', 'reviewer.db'));
        expect(config.dbPath).toMatch(/\.config\/agent-code-reviewer\/db\/reviewer\.db$/);
        expect(config.scanRoots).toEqual([homedir()]);
        expect(config.scanMaxDepth).toBe(3);
    });

    it('uses env var overrides', () => {
        process.env['PORT'] = '4000';
        process.env['DB_PATH'] = '/tmp/test.db';
        process.env['SCAN_ROOTS'] = '/a,/b,/c';
        process.env['SCAN_MAX_DEPTH'] = '5';

        const config = loadConfig();

        expect(config.port).toBe(4000);
        expect(config.dbPath).toBe('/tmp/test.db');
        expect(config.scanRoots).toEqual(['/a', '/b', '/c']);
        expect(config.scanMaxDepth).toBe(5);
    });

    it('trims whitespace in SCAN_ROOTS', () => {
        process.env['SCAN_ROOTS'] = ' /path/a , /path/b ';

        const config = loadConfig();

        expect(config.scanRoots).toEqual(['/path/a', '/path/b']);
    });

    it('returns numbers for integer fields', () => {
        process.env['PORT'] = '9999';
        process.env['SCAN_MAX_DEPTH'] = '10';

        const config = loadConfig();

        expect(typeof config.port).toBe('number');
        expect(typeof config.scanMaxDepth).toBe('number');
    });

    it('handles single SCAN_ROOT without comma', () => {
        process.env['SCAN_ROOTS'] = '/single/path';

        const config = loadConfig();

        expect(config.scanRoots).toEqual(['/single/path']);
    });
});

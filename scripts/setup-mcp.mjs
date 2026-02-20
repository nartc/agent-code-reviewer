import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[0;32m';
const CYAN = '\x1b[0;36m';
const YELLOW = '\x1b[0;33m';
const RESET = '\x1b[0m';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MCP_ENTRY = join(ROOT, 'packages', 'mcp-server', 'dist', 'index.js');
const SERVER_URL = 'http://localhost:3847';

console.log();
console.log(`${BOLD}${CYAN}=== agent-code-reviewer MCP Setup ===${RESET}`);
console.log();
console.log(`${YELLOW}Building mcp-server...${RESET}`);
console.log();

execSync('pnpm nx build mcp-server', { cwd: ROOT, stdio: 'inherit' });

console.log();
console.log(`${GREEN}${BOLD}Build complete!${RESET}`);
console.log();
console.log(`${BOLD}Add the following config to your TARGET project's MCP config file.${RESET}`);
console.log();

// Claude Code
console.log(`${CYAN}${BOLD}── Claude Code (.mcp.json) ──────────────────────────────────────────────────${RESET}`);
console.log(`Add to ${BOLD}.mcp.json${RESET} in your target repo:`);
console.log();
console.log(JSON.stringify({
    mcpServers: {
        'agent-code-reviewer': {
            type: 'stdio',
            command: 'node',
            args: [MCP_ENTRY],
            env: { SERVER_URL },
        },
    },
}, null, 2));
console.log();

// OpenCode
console.log(`${CYAN}${BOLD}── OpenCode (opencode.json) ─────────────────────────────────────────────────${RESET}`);
console.log(`Add to ${BOLD}opencode.json${RESET} in your target repo under the ${BOLD}mcp${RESET} key:`);
console.log();
console.log(JSON.stringify({
    mcp: {
        'agent-code-reviewer': {
            type: 'local',
            command: `node ${MCP_ENTRY}`,
            env: { SERVER_URL },
        },
    },
}, null, 2));
console.log();

console.log(`${YELLOW}Note:${RESET} SERVER_URL points to the running agent-code-reviewer server.`);
console.log('      The server must be running for the MCP tools to work.');
console.log();

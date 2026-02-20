import {
    type AgentHarness,
    type CommentPayload,
    SUPPORTED_AGENT_HARNESSES,
    type Target,
    type TransportError,
    type TransportStatus,
    type TransportUnavailableError,
    formatCommentsForTransport,
    transportError,
} from '@agent-code-reviewer/shared';
import { ResultAsync, okAsync } from 'neverthrow';
import { execFile } from 'node:child_process';
import type { SendOptions, SendResult, Transport } from './transport.interface.js';

const SEMVER_RE = /^\d+\.\d+\.\d+/;

function resolveAgentHarness(command: string): AgentHarness | null {
    if (command in SUPPORTED_AGENT_HARNESSES) return command as AgentHarness;
    // Claude Code reports its version number (e.g. "2.1.45") as the process name
    if (SEMVER_RE.test(command)) return 'claude';
    return null;
}

function execFileAsync(
    cmd: string,
    args: string[],
    options?: { input?: string },
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = execFile(cmd, args, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
        const stdin = child.stdin;
        if (options?.input != null && stdin) {
            const ok = stdin.write(options.input);
            if (!ok) {
                stdin.once('drain', () => stdin.end());
            } else {
                stdin.end();
            }
        }
    });
}

export class TmuxTransport implements Transport {
    readonly type = 'tmux' as const;

    isAvailable(): ResultAsync<boolean, never> {
        return ResultAsync.fromPromise(
            execFileAsync('tmux', ['list-sessions']).then(() => true),
            () => false,
        ).orElse((val) => okAsync(val));
    }

    listTargets(): ResultAsync<Target[], TransportError> {
        return ResultAsync.fromPromise(
            execFileAsync('tmux', [
                'list-panes',
                '-a',
                '-F',
                '#{session_name}:#{window_index}.#{pane_index} #{pane_title} #{pane_current_command}',
            ]),
            (e) => transportError(`Failed to list tmux panes: ${e instanceof Error ? e.message : String(e)}`, e),
        ).map(({ stdout }) => {
            return stdout
                .trim()
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) => {
                    const parts = line.split(' ');
                    const id = parts[0];
                    const pane_title = parts[1] ?? '';
                    const pane_current_command = parts[2] ?? '';
                    const agent = resolveAgentHarness(pane_current_command);
                    const displayName = agent ? SUPPORTED_AGENT_HARNESSES[agent] : pane_current_command;
                    return {
                        id,
                        label: `${id} — ${displayName}`,
                        transport: 'tmux' as const,
                        metadata: { pane_title, pane_current_command },
                    };
                });
        });
    }

    listTargetsForRepo(repoPath: string): ResultAsync<Target[], TransportError> {
        return ResultAsync.fromPromise(
            execFileAsync('tmux', [
                'list-panes',
                '-a',
                '-F',
                '#{session_name}:#{window_index}.#{pane_index} #{pane_current_path} #{pane_current_command}',
            ]),
            (e) => transportError(`Failed to list tmux panes: ${e instanceof Error ? e.message : String(e)}`, e),
        ).map(({ stdout }) => {
            const normalizedRepo = repoPath.replace(/\/+$/, '');
            return stdout
                .trim()
                .split('\n')
                .filter((line) => line.length > 0)
                .reduce<Target[]>((targets, line) => {
                    const parts = line.split(' ');
                    const id = parts[0];
                    const panePath = parts[1] ?? '';
                    const paneCommand = parts[2] ?? '';

                    const agent = resolveAgentHarness(paneCommand);
                    if (!agent) return targets;

                    const normalizedPane = panePath.replace(/\/+$/, '');
                    if (normalizedPane !== normalizedRepo && !normalizedPane.startsWith(`${normalizedRepo}/`)) {
                        return targets;
                    }

                    targets.push({
                        id,
                        label: `${SUPPORTED_AGENT_HARNESSES[agent]} — ${id}`,
                        transport: 'tmux' as const,
                        metadata: { agent, pane_path: panePath, pane_command: paneCommand },
                    });
                    return targets;
                }, []);
        });
    }

    sendComments(
        targetId: string,
        payloads: CommentPayload[],
        options?: SendOptions,
    ): ResultAsync<SendResult, TransportError | TransportUnavailableError> {
        const formatted = formatCommentsForTransport(payloads, { snapshot_id: options?.snapshot_id });
        const bufferName = `pr-review-${Date.now()}`;

        return ResultAsync.fromPromise(
            execFileAsync('tmux', ['load-buffer', '-b', bufferName, '-'], { input: formatted }),
            (e) => transportError(`tmux load-buffer failed: ${e instanceof Error ? e.message : String(e)}`, e),
        )
            .andThen(() =>
                ResultAsync.fromPromise(
                    execFileAsync('tmux', ['paste-buffer', '-b', bufferName, '-t', targetId]),
                    (e) =>
                        transportError(
                            `tmux paste-buffer failed for target "${targetId}": ${e instanceof Error ? e.message : String(e)}`,
                            e,
                        ),
                ),
            )
            .andThen(() =>
                ResultAsync.fromPromise(
                    execFileAsync('tmux', ['send-keys', '-t', targetId, 'Enter']),
                    (e) => transportError(`tmux send-keys failed: ${e instanceof Error ? e.message : String(e)}`, e),
                ),
            )
            .andThen(() =>
                ResultAsync.fromPromise(execFileAsync('tmux', ['delete-buffer', '-b', bufferName]), (e) => {
                    console.error(`[tmux] delete-buffer warning: ${e instanceof Error ? e.message : String(e)}`);
                    return transportError(`tmux delete-buffer failed`, e);
                }).orElse(() => okAsync({ stdout: '', stderr: '' })),
            )
            .map(() => ({ success: true }));
    }

    getStatus(): ResultAsync<TransportStatus, never> {
        return this.isAvailable().map((available) => ({
            type: 'tmux' as const,
            available,
        }));
    }
}

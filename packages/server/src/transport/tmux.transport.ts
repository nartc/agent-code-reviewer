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
import type { SendResult, Transport } from './transport.interface.js';

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
        if (options?.input != null && child.stdin) {
            child.stdin.write(options.input);
            child.stdin.end();
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
                    return {
                        id,
                        label: `${id} — ${pane_current_command}`,
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

                    const agent = paneCommand as AgentHarness;
                    if (!(agent in SUPPORTED_AGENT_HARNESSES)) return targets;

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
    ): ResultAsync<SendResult, TransportError | TransportUnavailableError> {
        const formatted = formatCommentsForTransport(payloads);
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

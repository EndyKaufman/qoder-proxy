import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { LogStoreService } from '../log-store/log-store.service';
import type { AppConfig } from '../config/configuration';
import type { QoderMessage } from '../utils/format';

export interface RunQoderRequestOptions {
  prompt: string;
  model: string;
  flags?: string[];
  timeoutMs?: number;
  /** Path to MCP config JSON file (--mcp-config) */
  mcpConfigPath?: string;
  /** Additional system prompt (--append-system-prompt) */
  systemPrompt?: string;
  /** Working directory for qodercli (--cwd) */
  cwd?: string;
  onChunk: (data: { type: string; subtype?: string; message?: QoderMessage }) => void;
  onDone: (code: number, stderr: string) => void;
  onError: (err: Error & { code?: string }) => void;
}

interface QoderCliCommand {
  cmd: string;
  viaCmd: boolean;
}

const isBenignQoderStderr = (text: string): boolean => {
  if (!text) return false;
  return (
    text.includes('failed to asynchronously prepare wasm') ||
    text.includes('function="_abort_js"') ||
    text.includes('Aborted(LinkError: WebAssembly.instantiate()') ||
    text.includes('Ignored invalid setting "hooks.')
  );
};

@Injectable()
export class QoderCliService {
  constructor(
    private configService: ConfigService<AppConfig>,
    private logStoreService: LogStoreService,
  ) {}

  private qoderEnv(): NodeJS.ProcessEnv {
    const pat = this.configService.get<string>('QODER_PAT');
    return {
      ...process.env,
      ...(pat ? { QODER_PERSONAL_ACCESS_TOKEN: pat } : {}),
      NO_BROWSER: '1',
      CI: '1',
      HOME: process.env.HOME || '/root',
    };
  }

  private getQoderCliCommand(): QoderCliCommand {
    if (process.platform === 'win32')
      return { cmd: 'qodercli.cmd', viaCmd: true };

    if (process.env.QODERCLI_BIN)
      return { cmd: process.env.QODERCLI_BIN, viaCmd: false };

    const candidates = [
      '/usr/local/bin/qodercli',
      '/usr/bin/qodercli',
      'qodercli',
    ];
    for (const c of candidates) {
      if (c.includes('/') && fs.existsSync(c))
        return { cmd: c, viaCmd: false };
    }
    return { cmd: 'qodercli', viaCmd: false };
  }

  private spawnQoderCli(
    prompt: string,
    model: string,
    flags: string[] = [],
    mcpConfigPath?: string,
    systemPrompt?: string,
    cwd?: string,
  ): ChildProcess {
    const qoder = this.getQoderCliCommand();
    if (process.platform === 'win32') {
      const safePrompt = prompt
        .replace(/"/g, '\\"')
        .replace(/[&|<>^]/g, '^$&');
      const args = ['/c', qoder.cmd, '-p', safePrompt, '-f', 'stream-json'];
      if (model) args.push('--model', model);
      if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
      if (systemPrompt) args.push('--append-system-prompt', systemPrompt);
      if (cwd) args.push('--cwd', cwd);
      if (flags.length) args.push(...flags);
      return spawn('cmd.exe', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.qoderEnv(),
      });
    } else {
      const args = ['-p', prompt, '-f', 'stream-json'];
      if (model) args.push('--model', model);
      if (mcpConfigPath) args.push('--mcp-config', mcpConfigPath);
      if (systemPrompt) args.push('--append-system-prompt', systemPrompt);
      if (cwd) args.push('--cwd', cwd);
      if (flags.length) args.push(...flags);
      return spawn(qoder.cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.qoderEnv(),
      });
    }
  }

  private hasVisibleAssistantText(data: {
    message?: QoderMessage;
  }): boolean {
    const content = data?.message?.content;
    if (typeof content === 'string') return content.trim().length > 0;
    if (!Array.isArray(content)) return false;
    return content.some((part) => {
      if (!part) return false;
      if (typeof part.text === 'string' && part.text.trim()) return true;
      if (typeof (part as any).value === 'string' && (part as any).value.trim()) return true;
      return false;
    });
  }

  private deepFindText(value: unknown, depth = 0): string {
    if (depth > 6 || value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        const t = this.deepFindText(item, depth + 1);
        if (t) return t;
      }
      return '';
    }
    if (typeof value === 'object') {
      const priorityKeys = [
        'text', 'value', 'result', 'output', 'content', 'message', 'final', 'answer',
      ];
      for (const key of priorityKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const t = this.deepFindText(
            (value as Record<string, unknown>)[key],
            depth + 1,
          );
          if (t) return t;
        }
      }
      // Fallback: recurse into all own properties
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (!priorityKeys.includes(key)) {
          const t = this.deepFindText(
            (value as Record<string, unknown>)[key],
            depth + 1,
          );
          if (t) return t;
        }
      }
    }
    return '';
  }

  private extractEventText(data: Record<string, unknown>): string {
    if (!data || typeof data !== 'object') return '';

    const msg = data.message as QoderMessage | undefined;
    const msgContent = msg?.content;
    if (typeof msgContent === 'string' && msgContent.trim()) return msgContent;
    if (Array.isArray(msgContent)) {
      const joined = msgContent
        .map((part) => {
          if (!part) return '';
          if (typeof part === 'string') return part;
          if (typeof part.text === 'string') return part.text;
          if (typeof part.value === 'string') return part.value;
          if (typeof (part as any).text?.value === 'string')
            return (part as any).text.value as string;
          return '';
        })
        .join('');
      if (joined.trim()) return joined;
    }

    if (typeof data.result === 'string' && (data.result as string).trim())
      return data.result as string;
    if (data.result && typeof data.result === 'object') {
      const r = data.result as Record<string, unknown>;
      if (typeof r.text === 'string' && (r.text as string).trim())
        return r.text as string;
      if (typeof r.value === 'string' && (r.value as string).trim())
        return r.value as string;
      if (
        typeof (r.text as Record<string, unknown>)?.value === 'string' &&
        ((r.text as Record<string, unknown>).value as string).trim()
      ) {
        return (r.text as Record<string, unknown>).value as string;
      }
    }

    return this.deepFindText(data);
  }

  runQoderRequest(opts: RunQoderRequestOptions): ChildProcess {
    const {
      prompt,
      model,
      flags = [],
      timeoutMs = 120_000,
      mcpConfigPath,
      systemPrompt,
      cwd,
      onChunk,
      onDone,
      onError,
    } = opts;

    let buffer = '';
    let stderrOutput = '';
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;
    let sawAssistantMessage = false;
    let lastSyntheticText = '';

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      fn();
    };

    const child = this.spawnQoderCli(prompt, model, flags, mcpConfigPath, systemPrompt, cwd);

    child.on('error', (err: Error) => {
      console.error('[qodercli error]', err.message);
    });

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        child.kill();
        settle(() =>
          onError(
            Object.assign(
              new Error(`qodercli timed out after ${timeoutMs}ms`),
              { code: 'TIMEOUT' },
            ),
          ),
        );
      }, timeoutMs);
    }

    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed);
          if (
            data.type === 'assistant' &&
            (data.subtype === 'message' || data.message?.type === 'message')
          ) {
            if (this.hasVisibleAssistantText(data)) sawAssistantMessage = true;
            onChunk(data);
          } else {
            const fallbackText = this.extractEventText(data);
            if (!fallbackText || sawAssistantMessage) continue;
            if (fallbackText === lastSyntheticText) continue;
            lastSyntheticText = fallbackText;
            onChunk({
              type: 'assistant',
              subtype: 'message',
              message: {
                content: [{ type: 'text', text: fallbackText }],
              },
            });
          }
        } catch {
          if (trimmed && !trimmed.startsWith('{')) {
            onChunk({
              type: 'assistant',
              subtype: 'message',
              message: {
                content: [{ type: 'text', text: trimmed }],
              },
            });
          }
        }
      }
    });

    child.stdout!.on('end', () => {
      const trimmed = buffer.trim();
      if (!trimmed) return;

      try {
        const data = JSON.parse(trimmed);
        if (
          data.type === 'assistant' &&
          (data.subtype === 'message' || data.message?.type === 'message')
        ) {
          if (this.hasVisibleAssistantText(data)) sawAssistantMessage = true;
          onChunk(data);
        } else {
          const fallbackText = this.extractEventText(data);
          if (!fallbackText || sawAssistantMessage) return;
          if (fallbackText === lastSyntheticText) return;
          lastSyntheticText = fallbackText;
          onChunk({
            type: 'assistant',
            subtype: 'message',
            message: {
              content: [{ type: 'text', text: fallbackText }],
            },
          });
        }
      } catch {
        if (!trimmed.startsWith('{')) {
          onChunk({
            type: 'assistant',
            subtype: 'message',
            message: {
              content: [{ type: 'text', text: trimmed }],
            },
          });
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      stderrOutput += text + '\n';
      if (!isBenignQoderStderr(text)) {
        this.logStoreService.addSystem(text, 'error', 'qodercli-stderr');
      }
    });

    child.on('close', (code, signal) => {
      const finalCode = code ?? (signal ? -1 : 0);
      const finalStderr = signal
        ? `${stderrOutput.trim()}${stderrOutput.trim() ? '\n' : ''}Process terminated by signal: ${signal}`
        : stderrOutput.trim();
      settle(() => onDone(finalCode, finalStderr));
    });

    child.on('error', (err: Error) => {
      this.logStoreService.addSystem(err.message, 'error', 'qodercli-spawn');
      settle(() => onError(err));
    });

    return child;
  }

  checkQoderCli(): Promise<string | null> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let done = false;
      const finish = (val: string | null) => {
        if (!done) {
          done = true;
          resolve(val);
        }
      };

      const qoder = this.getQoderCliCommand();

      if (
        process.platform !== 'win32' &&
        qoder.cmd.includes('/') &&
        fs.existsSync(qoder.cmd)
      ) {
        return finish('available');
      }

      const child =
        process.platform === 'win32'
          ? spawn('cmd.exe', ['/c', qoder.cmd, '--help'], {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: this.qoderEnv(),
            })
          : spawn(qoder.cmd, ['--help'], {
              stdio: ['ignore', 'pipe', 'pipe'],
              env: this.qoderEnv(),
            });

      child.stdout!.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));

      child.on('close', (code) => {
        const output = (stdout || stderr).trim();
        finish(output || code !== null ? 'available' : null);
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        finish(err.code === 'ENOENT' ? null : 'installed');
      });

      setTimeout(() => {
        child.kill();
        finish('timeout');
      }, 8000);
    });
  }
}

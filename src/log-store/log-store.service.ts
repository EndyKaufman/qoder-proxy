import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import type { AppConfig } from '../config/configuration';

interface RequestLogEntry {
  id: string;
  timestamp: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  isStream?: boolean;
  streamChunks?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  error?: unknown;
}

interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

@Injectable()
export class LogStoreService {
  private requestLog: RequestLogEntry[] = [];
  private systemLog: SystemLogEntry[] = [];

  constructor(private configService: ConfigService<AppConfig>) {}

  private get maxEntries(): number {
    return this.configService.get<number>('LOG_MAX_ENTRIES') || 500;
  }

  private get maxBytes(): number {
    return this.configService.get<number>('LOG_BODY_MAX_BYTES') || 8192;
  }

  private truncate(val: unknown): unknown {
    if (val == null) return null;
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    if (str.length > this.maxBytes)
      return str.slice(0, this.maxBytes) + '…[truncated]';
    return typeof val === 'string' ? val : val;
  }

  addRequest(entry: Omit<RequestLogEntry, 'id' | 'timestamp'>): void {
    if (this.requestLog.length >= this.maxEntries) this.requestLog.shift();
    this.requestLog.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...entry,
      requestPayload: this.truncate(entry.requestPayload),
      responsePayload: this.truncate(entry.responsePayload),
    });
  }

  addSystem(message: string, level = 'info', source = 'server'): void {
    if (this.systemLog.length >= this.maxEntries) this.systemLog.shift();
    this.systemLog.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    });
    const tag = level === 'error' ? '✖' : level === 'warn' ? '⚠' : '·';
    console.log(`[${source}] ${tag} ${message}`);
  }

  getRequests(): RequestLogEntry[] {
    return [...this.requestLog].reverse();
  }

  getSystem(): SystemLogEntry[] {
    return [...this.systemLog].reverse();
  }

  clearRequests(): void {
    this.requestLog.length = 0;
  }

  clearSystem(): void {
    this.systemLog.length = 0;
  }
}

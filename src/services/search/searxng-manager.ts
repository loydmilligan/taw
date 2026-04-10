import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlobalConfig } from '../config/schema.js';

const execFileAsync = promisify(execFile);

export interface SearxngSettings {
  enabled: boolean;
  autoStart: boolean;
  baseUrl: string;
  composeFile: string;
  serviceName: string;
  idleMinutes: number;
}

export interface SearchBackendStatus {
  enabled: boolean;
  dockerAvailable: boolean;
  running: boolean;
  healthy: boolean;
  autoStart: boolean;
  baseUrl: string;
  composeFile: string;
  serviceName: string;
  idleMinutes: number;
  autoStopAt: string | null;
  lastError: string | null;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface SearxngManagerOptions {
  runCommand?: (
    command: string,
    args: string[],
    cwd: string
  ) => Promise<CommandResult>;
  checkHealth?: (baseUrl: string) => Promise<boolean>;
}

export class SearxngManager {
  private readonly settings: SearxngSettings;
  private readonly runCommand;
  private readonly checkHealth;
  private idleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private autoStopAt: string | null = null;
  private lastError: string | null = null;

  constructor(settings: SearxngSettings, options: SearxngManagerOptions = {}) {
    this.settings = settings;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.checkHealth = options.checkHealth ?? defaultCheckHealth;
  }

  static fromGlobalConfig(globalConfig: GlobalConfig): SearxngManager {
    return new SearxngManager(resolveSearxngSettings(globalConfig));
  }

  async getStatus(): Promise<SearchBackendStatus> {
    const dockerAvailable = await this.isDockerComposeAvailable();
    const running = dockerAvailable ? await this.isRunning() : false;
    const healthy = running ? await this.safeHealthCheck() : false;

    return {
      enabled: this.settings.enabled,
      dockerAvailable,
      running,
      healthy,
      autoStart: this.settings.autoStart,
      baseUrl: this.settings.baseUrl,
      composeFile: this.settings.composeFile,
      serviceName: this.settings.serviceName,
      idleMinutes: this.settings.idleMinutes,
      autoStopAt: this.autoStopAt,
      lastError: this.lastError
    };
  }

  async start(): Promise<SearchBackendStatus> {
    if (!this.settings.enabled) {
      this.lastError = 'SearXNG is disabled in config.';
      return this.getStatus();
    }

    await this.assertDockerComposeAvailable();
    await this.runComposeCommand(['up', '-d', this.settings.serviceName]);
    await this.waitForHealthy();
    this.touch();
    this.lastError = null;
    return this.getStatus();
  }

  async stop(): Promise<SearchBackendStatus> {
    this.clearIdleTimer();

    if (!(await this.isDockerComposeAvailable())) {
      return this.getStatus();
    }

    await this.runComposeCommand(['stop', this.settings.serviceName]);
    this.lastError = null;
    return this.getStatus();
  }

  async touch(): Promise<SearchBackendStatus> {
    this.scheduleAutoStop();
    return this.getStatus();
  }

  private async waitForHealthy(): Promise<void> {
    const timeoutAt = Date.now() + 45_000;

    while (Date.now() < timeoutAt) {
      if (await this.safeHealthCheck()) {
        return;
      }

      await sleep(1_000);
    }

    this.lastError = `SearXNG did not become healthy within 45 seconds at ${this.settings.baseUrl}.`;
    throw new Error(this.lastError);
  }

  private async safeHealthCheck(): Promise<boolean> {
    try {
      return await this.checkHealth(this.settings.baseUrl);
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : 'SearXNG health check failed.';
      return false;
    }
  }

  private async isDockerComposeAvailable(): Promise<boolean> {
    try {
      await this.runCommand('docker', ['compose', 'version'], process.cwd());
      return true;
    } catch {
      return false;
    }
  }

  private async assertDockerComposeAvailable(): Promise<void> {
    if (!(await this.isDockerComposeAvailable())) {
      this.lastError = 'Docker Compose is not available on this machine.';
      throw new Error(this.lastError);
    }
  }

  private async isRunning(): Promise<boolean> {
    const { stdout } = await this.runComposeCommand([
      'ps',
      '--status',
      'running',
      '--services'
    ]);

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .includes(this.settings.serviceName);
  }

  private async runComposeCommand(args: string[]): Promise<CommandResult> {
    return this.runCommand(
      'docker',
      ['compose', '-f', this.settings.composeFile, ...args],
      path.dirname(this.settings.composeFile)
    );
  }

  private scheduleAutoStop(): void {
    this.clearIdleTimer();

    if (this.settings.idleMinutes <= 0) {
      this.autoStopAt = null;
      return;
    }

    const delayMs = this.settings.idleMinutes * 60_000;
    this.autoStopAt = new Date(Date.now() + delayMs).toISOString();
    this.idleTimer = globalThis.setTimeout(() => {
      void this.stop().catch((error) => {
        this.lastError =
          error instanceof Error
            ? error.message
            : 'Failed to stop SearXNG after idle timeout.';
      });
    }, delayMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      globalThis.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.autoStopAt = null;
  }
}

export function resolveSearxngSettings(
  globalConfig: GlobalConfig
): SearxngSettings {
  const config = globalConfig.searchBackend.searxng;

  return {
    enabled: config.enabled,
    autoStart: config.autoStart,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    composeFile: config.composeFile ?? getDefaultSearxngComposeFile(),
    serviceName: config.serviceName,
    idleMinutes: config.idleMinutes
  };
}

export function getDefaultSearxngComposeFile(): string {
  return fileURLToPath(
    new URL('../../../infra/docker-compose.yml', import.meta.url)
  );
}

async function defaultRunCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      encoding: 'utf8'
    });

    return {
      stdout: stdout ?? '',
      stderr: stderr ?? ''
    };
  } catch (error) {
    if (!shouldRetryWithDockerGroup(command, error)) {
      throw error;
    }

    const { stdout, stderr } = await execFileAsync(
      'sg',
      ['docker', '-c', buildShellCommand(command, args)],
      {
        cwd,
        encoding: 'utf8'
      }
    );

    return {
      stdout: stdout ?? '',
      stderr: stderr ?? ''
    };
  }
}

async function defaultCheckHealth(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function shouldRetryWithDockerGroup(command: string, error: unknown): boolean {
  if (command !== 'docker') {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes(
      'permission denied while trying to connect to the docker api'
    ) ||
    message.includes('/var/run/docker.sock') ||
    message.includes(
      'got permission denied while trying to connect to the docker daemon socket'
    )
  );
}

function buildShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellEscape).join(' ');
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

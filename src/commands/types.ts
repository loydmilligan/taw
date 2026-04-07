import type { ProviderConfig } from '../types/provider.js';
import type { SessionRecord } from '../types/session.js';
import type { TranscriptEntry } from '../types/app.js';
import type { GlobalConfig, ProjectConfig } from '../services/config/schema.js';

export interface CommandContext {
  cwd: string;
  session: SessionRecord;
  transcript: TranscriptEntry[];
  providerConfig: ProviderConfig;
  mode: string;
  globalConfig: GlobalConfig;
  projectConfig: ProjectConfig | null;
}

export interface CommandResult {
  session?: SessionRecord;
  mode?: string;
  providerConfig?: ProviderConfig;
  provider?: string;
  model?: string;
  shouldExit?: boolean;
  entries: TranscriptEntry[];
}

export interface ParsedCommand {
  name: string;
  args: string[];
  raw: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage: string;
  run: (input: ParsedCommand, context: CommandContext) => Promise<CommandResult>;
}

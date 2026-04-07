import { attachDirCommand } from './attach-dir.js';
import { brainstormCommand } from './brainstorm.js';
import { captureIdeaCommand } from './capture-idea.js';
import { captureIssueCommand } from './capture-issue.js';
import { configCommand } from './config.js';
import { exitCommand } from './exit.js';
import { exitModeCommand } from './exit-mode.js';
import { finalizeCommand } from './finalize.js';
import { createHelpCommand } from './help.js';
import { ideasCommand } from './ideas.js';
import { initCommand } from './init.js';
import { issuesCommand } from './issues.js';
import { statusCommand } from './status.js';
import { summarizeSessionCommand } from './summarize-session.js';
import { sessionUsageCommand } from './session-usage.js';
import { workflowCommand } from './workflow.js';
import type { CommandDefinition } from './types.js';

const coreCommands: CommandDefinition[] = [
  brainstormCommand,
  workflowCommand,
  finalizeCommand,
  exitModeCommand,
  attachDirCommand,
  captureIdeaCommand,
  captureIssueCommand,
  ideasCommand,
  issuesCommand,
  sessionUsageCommand,
  configCommand,
  initCommand,
  summarizeSessionCommand,
  exitCommand,
  statusCommand
];
export const commandRegistry: CommandDefinition[] = [...coreCommands];

commandRegistry.unshift(createHelpCommand(commandRegistry));

export function getCommandDefinition(name: string): CommandDefinition | undefined {
  return commandRegistry.find((command) => command.name === name);
}

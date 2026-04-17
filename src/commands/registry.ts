import { attachDirCommand } from './attach-dir.js';
import { brainstormCommand } from './brainstorm.js';
import { cancelCommand } from './cancel.js';
import { captureIdeaCommand } from './capture-idea.js';
import { captureIssueCommand } from './capture-issue.js';
import { confirmCommand } from './confirm.js';
import { configCommand } from './config.js';
import { exitCommand } from './exit.js';
import { exitModeCommand } from './exit-mode.js';
import { finalizeCommand, finalizeGenerateCommand } from './finalize.js';
import { createHelpCommand } from './help.js';
import { histerCommand } from './hister.js';
import { ideasCommand } from './ideas.js';
import { initCommand } from './init.js';
import { issuesCommand } from './issues.js';
import { openSourceCommand, sourceViewsCommand } from './open-source.js';
import { openRouterKeyCommand } from './or-key.js';
import { rateSourceCommand } from './rate-source.js';
import { researchCommand } from './research.js';
import { searchSourceCommand } from './search-source.js';
import { sourcesCommand } from './sources.js';
import { sourceNoteCommand } from './source-note.js';
import { statusCommand } from './status.js';
import { summarizeSessionCommand } from './summarize-session.js';
import { sessionUsageCommand } from './session-usage.js';
import { workflowCommand } from './workflow.js';
import { commitMapCommand } from './commit-map.js';
import { loadMapCommand } from './load-map.js';
import { saveMapCommand } from './save-map.js';
import { wikiItemCommand } from './wiki-item.js';
import { wikiFinalizeItemCommand } from './wiki-finalize-item.js';
import { wikiSaveItemCommand } from './wiki-save-item.js';
import { wikiAddResearchCommand } from './wiki-add-research.js';
import { wikiResolveItemCommand } from './wiki-resolve-item.js';
import { voiceCommand } from './voice.js';
import { wikiCommand } from './wiki.js';
import type { CommandDefinition } from './types.js';

const coreCommands: CommandDefinition[] = [
  brainstormCommand,
  confirmCommand,
  cancelCommand,
  researchCommand,
  workflowCommand,
  histerCommand,
  sourcesCommand,
  openSourceCommand,
  sourceViewsCommand,
  openRouterKeyCommand,
  sourceNoteCommand,
  searchSourceCommand,
  rateSourceCommand,
  finalizeCommand,
  finalizeGenerateCommand,
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
  saveMapCommand,
  loadMapCommand,
  commitMapCommand,
  wikiItemCommand,
  wikiFinalizeItemCommand,
  wikiSaveItemCommand,
  wikiAddResearchCommand,
  wikiResolveItemCommand,
  voiceCommand,
  exitCommand,
  statusCommand,
  wikiCommand
];
export const commandRegistry: CommandDefinition[] = [...coreCommands];

commandRegistry.unshift(createHelpCommand(commandRegistry));

export function getCommandDefinition(
  name: string
): CommandDefinition | undefined {
  return commandRegistry.find((command) => command.name === name);
}

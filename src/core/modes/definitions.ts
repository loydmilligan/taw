export interface ModeDefinition {
  name: string;
  artifactType: string | null;
  artifactTitle: string | null;
  activationMessage: string;
}

const modeDefinitions: Record<string, ModeDefinition> = {
  General: {
    name: 'General',
    artifactType: null,
    artifactTitle: null,
    activationMessage: 'General mode is active.'
  },
  Brainstorm: {
    name: 'Brainstorm',
    artifactType: 'project-brief',
    artifactTitle: 'project-brief',
    activationMessage:
      'Brainstorm mode is active. Explore the idea first. Use /finalize when you want to save a project brief.'
  },
  'Workflow Review': {
    name: 'Workflow Review',
    artifactType: 'workflow-review',
    artifactTitle: 'workflow-review',
    activationMessage:
      'Workflow review mode is active. Diagnose and iterate first. Use /finalize when you want to save the review.'
  },
  'Workflow Generate': {
    name: 'Workflow Generate',
    artifactType: 'workflow-generate',
    artifactTitle: 'workflow-generate',
    activationMessage:
      'Workflow generate mode is active. Refine the process first. Use /finalize when you want to save the workflow.'
  }
};

export function getModeDefinition(mode: string): ModeDefinition {
  return modeDefinitions[mode] ?? modeDefinitions.General;
}

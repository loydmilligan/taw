export interface ModeDefinition {
  name: string;
  artifactType: string | null;
  artifactTitle: string | null;
  activationMessage: string;
  researchType?: string | null;
}

const modeDefinitions: Record<string, ModeDefinition> = {
  General: {
    name: 'General',
    artifactType: null,
    artifactTitle: null,
    activationMessage: 'General mode is active.',
    researchType: null
  },
  Brainstorm: {
    name: 'Brainstorm',
    artifactType: 'project-brief',
    artifactTitle: 'project-brief',
    activationMessage:
      'Brainstorm mode is active. Explore the idea first. Use /finalize when you want to save a project brief.',
    researchType: null
  },
  'Workflow Review': {
    name: 'Workflow Review',
    artifactType: 'workflow-review',
    artifactTitle: 'workflow-review',
    activationMessage:
      'Workflow review mode is active. Diagnose and iterate first. Use /finalize when you want to save the review.',
    researchType: null
  },
  'Workflow Generate': {
    name: 'Workflow Generate',
    artifactType: 'workflow-generate',
    artifactTitle: 'workflow-generate',
    activationMessage:
      'Workflow generate mode is active. Refine the process first. Use /finalize when you want to save the workflow.',
    researchType: null
  },
  'Research Politics': {
    name: 'Research Politics',
    artifactType: 'research-politics',
    artifactTitle: 'research-politics',
    activationMessage:
      'Politics research mode is active. Compare sources, track framing differences, and use /finalize when you want to save the research brief.',
    researchType: 'politics'
  },
  'Research Tech': {
    name: 'Research Tech',
    artifactType: 'research-tech',
    artifactTitle: 'research-tech',
    activationMessage:
      'Tech research mode is active. Capture the useful ideas first, then use /finalize to save the digest.',
    researchType: 'tech'
  },
  'Research Repo': {
    name: 'Research Repo',
    artifactType: 'research-repo',
    artifactTitle: 'research-repo',
    activationMessage:
      'Repo research mode is active. Evaluate usage and integration ideas first, then use /finalize to save the repo evaluation.',
    researchType: 'repo'
  },
  'Research Video': {
    name: 'Research Video',
    artifactType: 'research-video',
    artifactTitle: 'research-video',
    activationMessage:
      'Video research mode is active. Capture timestamped notes and summary ideas first, then use /finalize to save the notes.',
    researchType: 'video'
  }
};

export function getModeDefinition(mode: string): ModeDefinition {
  return modeDefinitions[mode] ?? modeDefinitions.General;
}

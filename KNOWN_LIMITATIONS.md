# Known Limitations

Applies to baseline `0.1.0-beta.1`.

- Live provider-backed chat streaming was not manually verified in this environment because no OpenRouter, OpenAI, or Anthropic API keys were available during QA.
- The Anthropic adapter currently returns the final text as a single streamed chunk rather than token-by-token output.
- Running `/init` makes the directory project-aware for the next session; the current session remains on its existing storage root.

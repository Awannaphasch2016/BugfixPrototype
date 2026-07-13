# Vendored role-agent templates

Agent-template markdown files vendored verbatim from upstream, per
`docs/stage-4-spec.md` ("Implementation Decisions" → adopted tools) and
`docs/research/tool-stack-research.md` ("Prompt sources, ranked by
provenance"). These are the source texts for the runner's per-stage role
prompts (see `harness/prompts/`). Files are unmodified upstream copies;
adaptations belong in our own files, not here.

Fetched: 2026-07-13, pinned to the commit SHAs below via
`raw.githubusercontent.com`.

## anthropics-claude-plugins-official/

- **Source repo:** https://github.com/anthropics/claude-plugins-official
- **Ref:** commit `85822066fd6435dd39806f7b26b0a739444c3bcd` (HEAD of `main`, 2026-07-13)
- **License:** Apache-2.0 (`LICENSE` in this directory, copied from repo root)
- **Files:**
  - `code-architect.md` — upstream path
    `plugins/feature-dev/agents/code-architect.md`. **Used here as the
    planner role**: read-only codebase analysis producing an implementation
    blueprint; its output is posted to the issue as the plan comment and
    spliced additively into the fixer prompt (M1).
  - `code-reviewer.md` — upstream path
    `plugins/pr-review-toolkit/agents/code-reviewer.md`. **Used here as the
    reviewer role**: one post-hoc pass whose findings the runner posts as PR
    comments to inform the human merge decision.

## wshobson-agents/

- **Source repo:** https://github.com/wshobson/agents
- **Ref:** commit `2de74ac1c8f6669821dcef13153332c3168033c1` (HEAD of `main`, 2026-07-11)
- **License:** MIT, Copyright (c) 2024 Seth Hobson (`LICENSE` in this
  directory, copied from repo root)
- **Files:**
  - `debugger.md` — upstream path
    `plugins/debugging-toolkit/agents/debugger.md`, frontmatter name
    `debugging-toolkit-debugger`. **Optional debugger role** (fills the gap
    noted in the research doc: Anthropic's plugins ship no dedicated
    debugger); candidate source text for a diagnosis-oriented planner
    variant on bug-fix dispatches.

## Notes

- Claude Code loads `.claude/agents/**` recursively, so these register as
  project agents under their frontmatter names (`code-architect`,
  `code-reviewer`, `debugging-toolkit-debugger`). If a role needs adapted
  text, copy into a differently-named agent file rather than editing these.
- `code-reviewer.md` pins `model: opus`; the runner's model choice/config
  must account for that or override it.

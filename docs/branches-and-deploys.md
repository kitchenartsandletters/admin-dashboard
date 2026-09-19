# Branches & deploys

**`main` is the live branch.** The frontend and backend both deploy automatically from `main` on Railway; the branch Railway builds is configured in the Railway dashboard, not in this repo.

**Open every PR against `main`.**

The old **`development` branch is retired** — it drifted dozens of commits behind `main` and is no longer deployed. Do not branch from it or target it. Some historical notes elsewhere in the repo (for example the Phase 1 "Git state" line in the root `README.md`) still mention `development`; those predate this and are no longer accurate.

The same convention is recorded in `CLAUDE.md`, which Claude Code and other AI assistants read automatically at the start of a session — so keep the two in sync if either changes.

---
name: agent-interceptor
description: Reviews other Cursor agent sessions from local JSONL transcripts and reports stuck work, risky edits, or runaway behavior. Use when the user asks for an agent intercept report, watchdog summary, what other agents are doing, or monitoring parallel agent chats.
---

# Agent interceptor

## Purpose

Summarize **other** Cursor agent sessions (not the current chat) by reading **persisted transcripts** on disk. Flag **stalls**, **mode mismatches** (e.g. Ask vs Agent), **large or chaotic sessions**, and **signs of destructive change**—then suggest **git** as ground truth for real deletes.

## Transcript location

Transcripts live **outside the repo**, under the Cursor projects folder:

1. Encode the workspace absolute path: drop the leading `/`, replace every `/` with `-`.
   - Example: `/Users/warddem/dev/bimimport` → `Users-warddem-dev-bimimport`
2. Directory: `~/.cursor/projects/<encoded-path>/agent-transcripts/`
3. Each session is a folder named with a UUID; inside is `<uuid>.jsonl` (JSON Lines: one JSON object per line).

Shell one-liner to resolve:

```bash
ENC=$(pwd | sed 's|^/||;s|/|-|g')
echo "$HOME/.cursor/projects/$ENC/agent-transcripts"
```

If that path is missing, search with `find ~/.cursor/projects -name 'agent-transcripts' -type d 2>/dev/null` and pick the folder that matches this workspace.

## What to do

1. **List** `*.jsonl` under `agent-transcripts/` (recursively). For each file, note **mtime**, **line count** (`wc -l`), and **byte size** (`stat`).
2. **Exclude** the current conversation when possible (same session as this chat—often obvious if the only events are this request). Otherwise label it “current chat.”
3. **Tail** the last 2–5 lines of the **most recently modified** large transcripts to see latest assistant intent (tools are often reflected in message text).
4. **Scan** for risk signals in recent text (case-insensitive): `delete`, `rm `, `git reset`, `force`, `Ask mode`, `cannot edit`, `stuck`, repeated apologies, or very long planning without completion.
5. **Ground truth for deletes / diffs**: run from the repo root: `git status -sb`, and if useful `git diff --stat` or recent `git log -1 --stat`. Transcripts do not log every file operation.

## What not to promise

- **No live 20-second push** to chat: the assistant cannot post on a timer; only the user or a **local script** (`watch`, loop) can poll that fast.
- Transcripts are **best-effort**; tool calls may be redacted or summarized.

## Optional: local polling

If the user wants frequent checks without sending messages:

```bash
ENC=$(pwd | sed 's|^/||;s|/|-|g')
DIR="$HOME/.cursor/projects/$ENC/agent-transcripts"
watch -n 20 "find \"$DIR\" -name '*.jsonl' -exec stat -f '%m %N' {} \\; 2>/dev/null | sort -n | tail -5"
```

Adjust `watch` interval as needed.

## Report template

Use this structure in chat (adapt rows to what was found):

```markdown
## Agent intercept report

**Transcript root:** `<path>`

**Snapshot:** `<ISO time or "now">`

| Session (parent id) | Last modified | Lines / size | Assessment |
|---------------------|---------------|--------------|------------|
| `<uuid>` | … | … | e.g. active / quiet / long-running |

**Signals**
- **Stuck / blocked:** …
- **Heavy churn:** … (large line count or huge messages)
- **Risky language:** …
- **Git reality check:** `git status` summary …

**Recommendation:** …
```

## Citing transcripts to the user

When pointing the user at a session, use a short parent title and the UUID folder name, per project rules for agent transcript references.

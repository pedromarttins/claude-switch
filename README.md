# claude-switch

A PowerShell script that lets you run [Claude Code](https://claude.ai/code) using [DeepSeek](https://api-docs.deepseek.com/) as the backend — no terminal restart required.

## How it works

Claude Code is built on top of the Anthropic SDK and respects a set of environment variables to override its API endpoint, key, and model. This script sets those variables in **both the current session and persistently** (User scope), then launches Claude Code directly — eliminating the need to open a new terminal after switching.

When DeepSeek mode is active, the `/model` picker inside Claude Code is remapped:

| `/model` alias | DeepSeek model      | Profile              |
|----------------|---------------------|----------------------|
| `sonnet`       | `deepseek-v4-flash` | Fast and economical  |
| `opus`         | `deepseek-v4-pro`   | Most capable         |

## Prerequisites

- Windows 11
- [Claude Code](https://claude.ai/code) installed and available in `PATH`
- A [DeepSeek API key](https://platform.deepseek.com/api-keys)
- PowerShell 5.1 or later (included in Windows 11 by default)

## Setup

**1. Allow PowerShell scripts to run** (one-time, if not already done):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**2. Set your DeepSeek API key** as a permanent environment variable:

```powershell
[System.Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-your-key-here", "User")
```

Or set it temporarily for the current session only:

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
```

**3. Download `claude-switch.ps1`** and place it anywhere convenient (e.g. your Desktop or `C:\Tools`).

## Usage

```
.\claude-switch.ps1 [claude|deepseek|status] [-Model flash|pro] [-NoLaunch]
```

### Switch to DeepSeek

```powershell
# Start with deepseek-v4-flash (default)
.\claude-switch.ps1 deepseek

# Start with deepseek-v4-pro
.\claude-switch.ps1 deepseek -Model pro

# Set variables only, do not launch Claude Code
.\claude-switch.ps1 deepseek -NoLaunch
```

### Switch back to Claude (OAuth)

```powershell
.\claude-switch.ps1 claude
```

This removes all DeepSeek environment variables and launches Claude Code with your `claude.ai` account.

### Check current mode

```powershell
.\claude-switch.ps1 status
```

### Switching models from inside Claude Code

Once in DeepSeek mode, you can switch between models without leaving Claude Code:

```
/model sonnet   → deepseek-v4-flash (fast)
/model opus     → deepseek-v4-pro   (powerful)
```

### Going back to Claude from inside Claude Code

There is no in-session command to switch providers. Exit the session first, then run the script:

```
1. /quit  (or Ctrl+C)
2. .\claude-switch.ps1 claude
```

## Environment variables set by this script

| Variable                                    | DeepSeek mode value                      |
|---------------------------------------------|------------------------------------------|
| `ANTHROPIC_API_KEY`                         | Your DeepSeek API key                    |
| `ANTHROPIC_BASE_URL`                        | `https://api.deepseek.com/anthropic`     |
| `ANTHROPIC_MODEL`                           | `deepseek-v4-flash` or `deepseek-v4-pro` |
| `CLAUDE_CONFIG_DIR`                         | `~\.claude-deepseek`                     |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`            | `deepseek-v4-flash`                      |
| `ANTHROPIC_DEFAULT_SONNET_MODEL_NAME`       | `DeepSeek V4 Flash`                      |
| `ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION`| `Fast and economical`                    |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`              | `deepseek-v4-pro`                        |
| `ANTHROPIC_DEFAULT_OPUS_MODEL_NAME`         | `DeepSeek V4 Pro`                        |
| `ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION`  | `Most capable`                           |

A separate config directory (`~\.claude-deepseek`) is used so DeepSeek sessions do not interfere with your regular Claude settings.

All variables are removed when switching back to Claude mode.

## Permission mode

Claude Code launches with `--dangerously-skip-permissions`, which bypasses all permission prompts. Every file read, edit, and shell command runs without asking for approval.

This is intentional for a DeepSeek session where you want uninterrupted agentic operation, but it means **no safety net**: destructive commands will execute without confirmation. Avoid using this mode on critical infrastructure or repositories with irreversible operations.

To run with the default permission prompts instead:

```powershell
.\claude-switch.ps1 deepseek -NoLaunch
claude  # launches without --dangerously-skip-permissions
```

## claude-proxy.js

`claude-proxy.js` is an optional benchmarking tool — it is **not required** for normal operation.

It sits between Claude Code and DeepSeek as a local pass-through proxy and logs token consumption and request stats per session. Its purpose is to compare performance between Claude Code + DeepSeek and Codex + DeepSeek side by side.

To use it:

```powershell
# In a separate terminal, start the proxy
node claude-proxy.js           # silent
node claude-proxy.js --debug   # verbose request logging

# Then point Claude Code at it
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:3334"
.\claude-switch.ps1 deepseek -NoLaunch
claude --dangerously-skip-permissions
```

Press `Ctrl+C` in the proxy terminal to print a session summary (total requests, input/output tokens, averages).

## Known limitations

The following Claude Code features are **not available** when using DeepSeek as the backend:

- `/effort` — effort levels are Anthropic-specific
- Extended thinking (Alt+T) — Anthropic-specific feature
- Prompt caching — not implemented by DeepSeek
- `opusplan` model alias — depends on Claude internal behavior
- 1M token context window

## Privacy notice

When using DeepSeek mode, all your prompts and code are sent to DeepSeek's servers. Avoid using this mode with proprietary or sensitive codebases.

## Running without changing execution policy

If you prefer not to change the execution policy, run the script directly with bypass:

```powershell
powershell -ExecutionPolicy Bypass -File .\claude-switch.ps1 deepseek
```

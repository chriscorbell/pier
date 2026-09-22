<p align="center"><img src="assets/icon-tile.png" width="128" alt="Pier"></p>

<p align="center"><img src="assets/screenshot.png" width="800" alt="Pier showing a session transcript with the sidebar of projects and sessions"></p>

# Pier

**Pier** is a macOS desktop client for the [pi](https://pi.dev) coding agent.

It drives the `pi` you already have installed. Each open session is a `pi --mode rpc` process, so your models, settings, extensions, and slash commands work unchanged, and any Pier session can be resumed in the terminal with `pi -c`.

## Install

Download the DMG from the [latest release](https://github.com/chriscorbell/pier/releases/latest), open it, and drag Pier to Applications. The app is signed with a Developer ID and notarized, so it opens without a Gatekeeper prompt.

Pier checks for new releases every minute and installs them in place when you ask it to.

## Requirements

- macOS 13 or newer on Apple silicon
- `pi` 0.85 or newer on PATH (see https://pi.dev). Pier reads the version at launch and says so if it is too old.

## What it does

**Sessions and projects**
- Lists every project pi has run in, from `~/.pi/agent/sessions`, with the sessions under each. Projects can be dragged into your own order and collapsed.
- Search matches session titles and the text of the conversations.
- Right-click a session to rename, compact, restart pi, or move it to the Trash. Cmd-click and Shift-click select several sessions to trash at once. Right-click a project to remove it.
- Unread and needs-input markers in the sidebar, a Dock badge, and a sound when a turn finishes in the background.

**The transcript**
- Streams markdown, collapsed thinking, tool calls with live output, and edit diffs inline.
- Code blocks have a copy button and a word-wrap toggle.
- Cmd+F finds text in the open thread, browser style: highlighted matches, Enter for the next one.
- Extension dialogs (select, confirm, input, editor) render as sheets, with the structure the ask-user-question extension packs into them unpacked into labels, descriptions, and previews. Notifications become toasts.
- The rpiv-todo extension's task list shows above the composer as pi works through it.

**Composing**
- `/` commands from pi, `@` file mentions, image paste, and ArrowUp history.
- Follow-up queue while a turn runs, with promotion to steering.
- Model and reasoning-level pickers, a context meter, and the status text your extensions publish.

**Around the session**
- Read-only diff of the working tree against HEAD, refreshed as files change, plus a login shell in the project directory.
- Current git branch in the header.
- Interface and terminal color themes, font settings, and reduced motion.

App-only preferences live in `~/.pi/gui/settings.json`. Errors from the app itself go to `~/.pi/gui/pier.log` (Help > Show Log File). Everything else stays in pi's own configuration.

## Developing

```sh
pnpm install
pnpm dev
```

`pnpm typecheck` and `pnpm test` run in CI. `pnpm dist` builds the DMG; without a Developer ID certificate in the environment it is ad-hoc signed, which is enough for a local install.

Releases are cut by pushing a `v*` tag. The release workflow signs with the certificate in `CSC_LINK` and notarizes with the Apple ID credentials in the repository secrets. `scripts/setup-signing.sh` walks through producing those secrets from the certificate in your keychain.

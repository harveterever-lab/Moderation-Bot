# Moderation Bot

A lightweight Discord moderation bot built with Discord.js v14.

## Features

- **R!setup** — Administrator-only configuration command (prefix-based) to set log channel, quarantine role, and staff roles.
- **Slash commands**: `/kick`, `/mute`, `/unmute`, `/quarantine`, `/unquarantine`, `/ban`, `/remove-roles`, `/remove-emojis`
- Staff permission system with configurable roles per action.
- Role hierarchy and bot permission checks.
- Safe error handling and ephemeral error responses.
- Embed-based moderation logging.
- Owner-only role and emoji removal commands with confirmation flows.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your bot token.
3. Start the bot: `npm start`

## Configuration

Configuration is stored in memory and resets when the bot restarts. Use `R!setup` to configure:

- Log Channel
- Quarantine Role
- Mute Staff roles
- Kick Staff roles
- Quarantine Staff roles
- Ban Staff roles

## Owner-Only Commands

`/remove-roles` and `/remove-emojis` are restricted to the **server owner** only. Administrators and users with the Administrator permission cannot use them unless they are the actual server owner.

- **`/remove-roles`** — Delete a single role or all removable roles. Respects role hierarchy and excludes @everyone and managed roles.
- **`/remove-emojis`** — Delete a single custom emoji or all server emojis.

Both commands require confirmation before bulk deletion.

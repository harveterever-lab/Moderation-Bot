# Moderation Bot

A lightweight Discord moderation bot built with Discord.js v14.

## Features

- **R!setup** — Administrator-only configuration command (prefix-based) to set log channel, quarantine role, and staff roles.
- **R! Ticket setup** — Administrator-only guided setup for the ticket system (prefix-based). Configure panel title/description, staff role, 1–5 ticket buttons with names, emojis, Discord styles, and limits, inside-ticket embed (title, description, color, footer, close button), with live preview and confirmation.
- **R! delete panel** — Administrator-only command to delete the ticket panel configuration. Existing ticket channels are preserved.
- **Slash commands**: `/kick`, `/mute`, `/unmute`, `/quarantine`, `/unquarantine`, `/ban`, `/remove-roles`, `/remove-emojis`
- Staff permission system with configurable roles per action.
- Role hierarchy and bot permission checks.
- Safe error handling and ephemeral error responses.
- Embed-based moderation logging.
- Owner-only role and emoji removal commands with confirmation flows.

## Ticket System

- **Panel setup** — Guided multi-step conversation with preview and confirmation. Supports `{user}`, `{username}`, and `{type}` placeholders. If a panel exists, asks before replacing. Existing ticket channels and records are preserved.
- **Ticket creation** — Members click a button on the panel to create a ticket channel. One open ticket per member, enforced atomically via MongoDB. Numeric per-type limits also enforced atomically. Channels created in the normal channel list (no category required) with sanitized `ticket-username` names.
- **Permissions** — Ticket owner: view, send, read history. Ticket Staff Role: view, send, read history. Bot: required permissions. @everyone: denied view. No unrelated members have access.
- **Closing** — Owner, Ticket Staff Role, or authorized user can close. Atomic `open → closed` transition prevents duplicate cleanup. Handles already-closed, already-being-closed, and channel deletion failures safely.
- **Persistence** — Panel configuration and ticket records stored in MongoDB. Survives restarts. Atomic operations prevent race conditions, duplicate records, and duplicate channels.
- **Failure handling** — MongoDB unavailable: user-friendly error, no channel or record created. Channel creation failure: reservation rolled back. Discord permission failure: specific error message. Deleted panels, channels, or staff roles handled without crashing.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your bot token.
3. Set `MONGODB_URI` in your environment (Railage or local).
4. Start the bot: `npm start`

## Configuration

Moderation configuration is stored in memory and resets when the bot restarts. Use `R!setup` to configure:

- Log Channel
- Quarantine Role
- Mute Staff roles
- Kick Staff roles
- Quarantine Staff roles
- Ban Staff roles

Ticket panel configuration is persisted in MongoDB via `R! Ticket setup`.

## Owner-Only Commands

`/remove-roles` and `/remove-emojis` are restricted to the **server owner** only. Administrators and users with the Administrator permission cannot use them unless they are the actual server owner.

- **`/remove-roles`** — Delete a single role or all removable roles. Respects role hierarchy and excludes @everyone and managed roles.
- **`/remove-emojis`** — Delete a single custom emoji or all server emojis.

Both commands require confirmation before bulk deletion.

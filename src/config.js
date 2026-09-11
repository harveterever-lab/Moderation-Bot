// In-memory configuration store per guild.
// Resets when the bot restarts — no external database, by design.
//
// Ticket panel configuration is persisted in MongoDB (see db/models/TicketPanel.js).
// The transient ticketSetupStep / ticketSetupData fields below track the
// multi-step "R! Ticket setup" conversation, mirroring the existing setupStep /
// setupData pattern used by R!setup.

const guildConfigs = new Map();

/**
 * Get or create the config object for a guild.
 * @param {string} guildId
 * @returns {object}
 */
export function getGuildConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(guildId, {
      logChannelId: null,
      quarantineRoleId: null,
      muteStaffRoleIds: [],
      kickStaffRoleIds: [],
      quarantineStaffRoleIds: [],
      banStaffRoleIds: [],
      setupStep: null,
      setupData: null,
      ticketSetupStep: null,
      ticketSetupData: null,
    });
  }
  return guildConfigs.get(guildId);
}

/**
 * Reset the transient setup state (step tracker + partial data).
 * @param {string} guildId
 */
export function clearSetupState(guildId) {
  const config = getGuildConfig(guildId);
  config.setupStep = null;
  config.setupData = null;
}

/**
 * Reset the transient ticket setup state.
 * @param {string} guildId
 */
export function clearTicketSetupState(guildId) {
  const config = getGuildConfig(guildId);
  config.ticketSetupStep = null;
  config.ticketSetupData = null;
}

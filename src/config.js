// In-memory configuration store per guild.
// Resets when the bot restarts — no external database, by design.

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

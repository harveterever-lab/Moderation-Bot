import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Reusable guild configuration schema for MongoDB.
 * Future features can extend this model to persist per-guild settings
 * that are currently stored in memory by src/config.js.
 */
const guildConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    logChannelId: { type: String, default: null },
    quarantineRoleId: { type: String, default: null },
    muteStaffRoleIds: { type: [String], default: [] },
    kickStaffRoleIds: { type: [String], default: [] },
    quarantineStaffRoleIds: { type: [String], default: [] },
    banStaffRoleIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const GuildConfig = model('GuildConfig', guildConfigSchema);

export default mongoose;

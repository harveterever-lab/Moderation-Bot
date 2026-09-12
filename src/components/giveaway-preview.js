import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { Giveaway } from '../db/models/Giveaway.js';
import { buildGiveawayEmbed } from '../utils/giveawayHelpers.js';

/**
 * In-memory store for pending giveaway previews.
 * Keyed by `${userId}:${channelId}` so multiple admins don't interfere.
 * @type {Map<string, object>}
 */
const pendingPreviews = new Map();

function previewKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

/**
 * Register a pending giveaway preview.
 * @param {string} userId
 * @param {string} channelId
 * @param {object} options - The giveaway options
 */
export function registerGiveawayPreview(userId, channelId, options) {
  pendingPreviews.set(previewKey(userId, channelId), options);
}

/**
 * Get and remove a pending giveaway preview.
 * @param {string} userId
 * @param {string} channelId
 * @returns {object|null}
 */
function takePreview(userId, channelId) {
  const key = previewKey(userId, channelId);
  const data = pendingPreviews.get(key);
  pendingPreviews.delete(key);
  return data || null;
}

/**
 * Remove a pending preview without returning it.
 * @param {string} userId
 * @param {string} channelId
 */
function deletePreview(userId, channelId) {
  pendingPreviews.delete(previewKey(userId, channelId));
}

/**
 * Check whether an interaction customId belongs to the giveaway preview system.
 * @param {string} customId
 * @returns {boolean}
 */
export function isGiveawayPreviewButton(customId) {
  return customId === 'giveaway_confirm' || customId === 'giveaway_cancel';
}

/**
 * Handle giveaway preview button interactions.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleGiveawayPreviewButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  if (customId === 'giveaway_cancel') {
    deletePreview(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '❌ Giveaway creation cancelled.' });
    return;
  }

  if (customId === 'giveaway_confirm') {
    const options = takePreview(userId, channelId);
    if (!options) {
      await interaction.reply({ content: '❌ This giveaway preview is no longer active.', ephemeral: true });
      return;
    }

    if (!isDatabaseConnected()) {
      await interaction.update({ embeds: [], components: [], content: '❌ MongoDB is unavailable. Could not create the giveaway.' });
      return;
    }

    try {
      // Create the giveaway message in the target channel
      const channel = await interaction.client.channels.fetch(options.channelId);
      if (!channel) {
        await interaction.update({ embeds: [], components: [], content: '❌ The target channel could not be found.' });
        return;
      }

      const startTime = new Date();
      const endTime = new Date(Date.now() + options.durationMs);

      const giveawayDoc = new Giveaway({
        giveawayId: options.giveawayId,
        guildId: options.guildId,
        channelId: options.channelId,
        messageId: 'pending',
        hostId: options.hostId,
        prize: options.prize,
        winnerCount: options.winnerCount,
        startTime,
        endTime,
        reaction: options.reaction,
        requiredRoleId: options.requiredRoleId,
        image: options.image,
        thumbnail: options.thumbnail,
        participantIds: [],
        winnerIds: [],
        manualWinnerIds: [],
        status: 'active',
      });

      const hostUser = await interaction.client.users.fetch(options.hostId).catch(() => null);
      const embed = buildGiveawayEmbed(giveawayDoc, 0, hostUser);

      const sentMessage = await channel.send({ embeds: [embed] });

      // Add the reaction
      await sentMessage.react(options.reaction).catch((err) => {
        console.error('[GIVEAWAY CREATE] Failed to add reaction:', err.message);
      });

      // Save the message ID
      giveawayDoc.messageId = sentMessage.id;
      await giveawayDoc.save();

      // Schedule the end timer
      const { scheduleGiveawayTimer } = await import('../utils/giveawayManager.js');
      scheduleGiveawayTimer(giveawayDoc, interaction.client);

      await interaction.update({ embeds: [], components: [], content: `✅ Giveaway created in ${channel}! Message ID: \`${sentMessage.id}\`` });
    } catch (err) {
      console.error('[GIVEAWAY CREATE ERROR]', err.message);
      await interaction.update({ embeds: [], components: [], content: '❌ Failed to create the giveaway. Check my permissions and try again.' });
    }
  }
}

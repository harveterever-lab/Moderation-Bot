import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketPanel } from '../db/models/TicketPanel.js';

const PREFIX = 'R!';
const AUTHORIZED_USER_ID = '1505729763296411891';
const DELETE_TIMEOUT_MS = 5 * 60 * 1000;

function isAuthorized(member, userId) {
  if (userId === AUTHORIZED_USER_ID) return true;
  if (member && member.permissions && member.permissions.has('Administrator')) return true;
  return false;
}

/**
 * Handle the "R! delete panel" prefix command.
 * @param {import('discord.js').Message} message
 */
export async function handleTicketDeletePanel(message) {
  const content = message.content.slice(PREFIX.length).trim();
  if (!content.toLowerCase().startsWith('delete panel')) return;

  if (!isAuthorized(message.member, message.author.id)) {
    await message.reply('❌ You do not have permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The ticket system is temporarily unavailable. Please try again later.');
    return;
  }

  const guildId = message.guild.id;

  let panel;
  try {
    panel = await TicketPanel.findOne({ guildId });
  } catch (err) {
    console.error('[TICKET DELETE ERROR]', err.message);
    await message.reply('❌ The ticket system is temporarily unavailable. Please try again later.');
    return;
  }

  if (!panel) {
    await message.reply('❌ No ticket panel is currently configured.');
    return;
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle('🗑️ Delete Ticket Panel')
    .setDescription('Are you sure you want to delete the ticket panel?\n\nThis will remove the **panel message and configuration** only. Existing ticket channels will **not** be deleted.')
    .setColor(0xe74c3c)
    .setFooter({ text: 'You have 5 minutes to confirm.' });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_delete_confirm').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const confirmMsg = await message.reply({ embeds: [confirmEmbed], components: [confirmRow] });

  const filter = (i) => i.user.id === message.author.id && (i.customId === 'ticket_delete_confirm' || i.customId === 'ticket_delete_cancel');

  try {
    const interaction = await confirmMsg.awaitMessageComponent({ filter, time: DELETE_TIMEOUT_MS });

    if (interaction.customId === 'ticket_delete_cancel') {
      await interaction.update({ content: '❌ Panel deletion cancelled.', embeds: [], components: [] });
      return;
    }

    await interaction.deferUpdate();

    // Delete the panel message from Discord
    try {
      const ch = await message.guild.channels.fetch(panel.channelId).catch(() => null);
      if (ch) {
        const msg = await ch.messages.fetch(panel.messageId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
    } catch (err) {
      console.warn('[TICKET DELETE] Could not delete panel message:', err.message);
    }

    // Delete the panel config from MongoDB
    try {
      await TicketPanel.deleteOne({ guildId });
      console.log(`[TICKET] Panel deleted for guild ${guildId}`);
      await confirmMsg.edit({ content: '✅ Ticket panel has been deleted. Existing ticket channels are preserved.', embeds: [], components: [] });
    } catch (err) {
      console.error('[TICKET DELETE] MongoDB delete failed:', err.message);
      await confirmMsg.edit({ content: '❌ Failed to delete the panel configuration. Please try again.', embeds: [], components: [] });
    }
  } catch {
    // Timeout — disable buttons
    const expiredRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_delete_confirm').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger).setDisabled(true),
      new ButtonBuilder().setCustomId('ticket_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await confirmMsg.edit({ content: '❌ Confirmation timed out. Panel deletion cancelled.', embeds: [], components: [expiredRow] }).catch(() => {});
  }
}

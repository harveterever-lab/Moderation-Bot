import { isDatabaseConnected } from '../db/database.js';
import { TicketPanel } from '../db/models/TicketPanel.js';
import { Ticket } from '../db/models/Ticket.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

// Track in-progress closes to prevent duplicate processing
const closingSet = new Set();

/**
 * Check if a member can close a ticket (owner, staff role, admin, or authorized user).
 */
function canClose(member, userId, staffRoleId) {
  if (userId === AUTHORIZED_USER_ID) return true;
  if (member && member.permissions && member.permissions.has('Administrator')) return true;
  if (staffRoleId && member && member.roles && member.roles.cache.has(staffRoleId)) return true;
  return false;
}

/**
 * Handle the ticket close button.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleTicketClose(interaction) {
  if (!interaction.guild) return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;

  let ticket;
  try {
    ticket = await Ticket.findOne({ guildId, channelId });
  } catch (err) {
    console.error('[TICKET CLOSE ERROR]', err.message);
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  if (!ticket) {
    await interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });
    return;
  }

  if (ticket.status === 'closed') {
    await interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
    return;
  }

  if (closingSet.has(channelId)) {
    await interaction.reply({ content: '❌ This ticket is already being closed.', ephemeral: true });
    return;
  }

  // Permission check
  let panel;
  try {
    panel = await TicketPanel.findOne({ guildId });
  } catch (err) {
    console.error('[TICKET CLOSE ERROR]', err.message);
  }

  const staffRoleId = panel ? panel.staffRoleId : null;
  const isOwner = ticket.ownerId === userId;
  const isStaff = canClose(interaction.member, userId, staffRoleId);

  if (!isOwner && !isStaff) {
    await interaction.reply({ content: '❌ You do not have permission to close this ticket.', ephemeral: true });
    return;
  }

  closingSet.add(channelId);

  // Atomically change open → closed
  let updated;
  try {
    updated = await Ticket.findOneAndUpdate(
      { _id: ticket._id, status: 'open' },
      { status: 'closed' },
      { new: true },
    );
  } catch (err) {
    closingSet.delete(channelId);
    console.error('[TICKET CLOSE ERROR]', err.message);
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  if (!updated) {
    closingSet.delete(channelId);
    await interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
    return;
  }

  await interaction.reply({ content: '✅ Ticket is being closed...' });

  // Delete the channel
  try {
    await interaction.channel.delete('Ticket closed');
    console.log(`[TICKET] Closed: guild=${guildId} channel=${channelId} by=${interaction.user.tag}`);
  } catch (err) {
    console.error('[TICKET CLOSE] Channel deletion failed:', err.message);
    if (err.code === 10003 || (err.message && err.message.includes('Unknown Channel'))) {
      console.log('[TICKET CLOSE] Channel was already deleted');
    } else {
      try {
        await interaction.followUp({ content: '⚠️ Ticket closed, but the channel could not be deleted automatically.' }).catch(() => {});
      } catch {}
    }
  } finally {
    closingSet.delete(channelId);
  }
}

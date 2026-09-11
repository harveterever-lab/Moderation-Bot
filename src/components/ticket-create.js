import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { TicketPanel } from '../db/models/TicketPanel.js';
import { Ticket } from '../db/models/Ticket.js';
import { sanitizeChannelName, buildInsideEmbed, buildCloseButton } from '../utils/ticketHelpers.js';

/**
 * Handle a ticket panel button click — creates a new ticket channel.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleTicketCreate(interaction) {
  if (!interaction.guild) return;

  const typeId = interaction.customId.split(':')[1];
  if (!typeId) return;

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const username = interaction.user.username;
  const userMention = `<@${userId}>`;

  let panel;
  try {
    panel = await TicketPanel.findOne({ guildId });
  } catch (err) {
    console.error('[TICKET CREATE ERROR]', err.message);
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  if (!panel) {
    await interaction.reply({ content: '❌ No ticket panel is configured for this server.', ephemeral: true });
    return;
  }

  const btnConfig = panel.buttons.find((b) => b.typeId === typeId);
  if (!btnConfig) {
    await interaction.reply({ content: '❌ This ticket type no longer exists.', ephemeral: true });
    return;
  }

  // Validate staff role still exists
  const staffRole = interaction.guild.roles.cache.get(panel.staffRoleId);
  if (!staffRole) {
    await interaction.reply({ content: '❌ The Ticket Staff Role no longer exists. An administrator must reconfigure the panel.', ephemeral: true });
    return;
  }

  // Check if user already has an open ticket (atomic findOne)
  let existingTicket;
  try {
    existingTicket = await Ticket.findOne({ guildId, ownerId: userId, status: 'open' });
  } catch (err) {
    console.error('[TICKET CREATE ERROR]', err.message);
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  if (existingTicket) {
    await interaction.reply({ content: '❌ You already have an open ticket.', ephemeral: true });
    return;
  }

  // Enforce type limit atomically
  if (btnConfig.limit !== 'inf') {
    const limit = parseInt(btnConfig.limit, 10);
    let count;
    try {
      count = await Ticket.countDocuments({ guildId, typeId, status: 'open' });
    } catch (err) {
      console.error('[TICKET CREATE ERROR]', err.message);
      await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
      return;
    }
    if (count >= limit) {
      await interaction.reply({ content: '❌ This ticket type has reached its limit. Please try again later.', ephemeral: true });
      return;
    }
  }

  // Reserve the ticket record atomically (placeholder channelId)
  let ticketDoc;
  try {
    ticketDoc = await Ticket.create({
      guildId,
      channelId: `pending_${Date.now()}_${userId}`,
      ownerId: userId,
      typeId,
      typeName: btnConfig.name,
      status: 'open',
    });
  } catch (err) {
    console.error('[TICKET CREATE ERROR]', err.message);
    await interaction.reply({ content: '❌ The ticket system is temporarily unavailable. Please try again later.', ephemeral: true });
    return;
  }

  // Create the channel
  let channel;
  try {
    await interaction.deferReply({ ephemeral: true });

    const permissionOverwrites = [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: panel.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
    ];

    channel = await interaction.guild.channels.create({
      name: sanitizeChannelName(username),
      type: ChannelType.GuildText,
      permissionOverwrites,
    });

    // Update the ticket record with the real channel ID
    await Ticket.updateOne({ _id: ticketDoc._id }, { channelId: channel.id });
  } catch (err) {
    console.error('[TICKET CREATE] Channel creation failed:', err.message);

    // Rollback the reservation
    try {
      await Ticket.deleteOne({ _id: ticketDoc._id });
    } catch (rollbackErr) {
      console.error('[TICKET CREATE] Rollback failed:', rollbackErr.message);
    }

    const missingPerms = err.code === 50013 || (err.message && err.message.includes('Missing Access'));
    if (missingPerms) {
      await interaction.editReply({ content: "❌ I don't have permission to create the ticket channel." });
    } else {
      await interaction.editReply({ content: "❌ I couldn't create your ticket. Please try again." });
    }
    return;
  }

  // Send the inside-ticket embed and close button
  try {
    const embed = buildInsideEmbed(panel, userMention, username, btnConfig.name);
    const row = buildCloseButton(panel);
    await channel.send({ content: `${userMention} <@&${panel.staffRoleId}>`, embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[TICKET CREATE] Failed to send inside-ticket message:', err.message);
  }

  console.log(`[TICKET] Created: guild=${guildId} channel=${channel.name} owner=${username} type=${btnConfig.name}`);
  await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
}

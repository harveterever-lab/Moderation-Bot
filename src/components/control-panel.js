import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import {
  buildInitialEmbed,
  buildMessageEmbed,
  buildInitialButtons,
  buildMessageButtons,
} from '../commands/control.js';

const MAX_MESSAGE_LENGTH = 2000;

const MODAL_CUSTOM_ID = 'control_modal';
const MODAL_INPUT_CUSTOM_ID = 'control_message_input';

/**
 * In-memory store for active control panels.
 * Keyed by `${userId}:${channelId}` — only the originating admin can interact.
 * @type {Map<string, {userId: string, channelId: string, message: string|null}>}
 */
const activePanels = new Map();

function panelKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

function getPanel(userId, channelId) {
  return activePanels.get(panelKey(userId, channelId)) || null;
}

function setPanel(userId, channelId, data) {
  activePanels.set(panelKey(userId, channelId), data);
}

function deletePanel(userId, channelId) {
  activePanels.delete(panelKey(userId, channelId));
}

/**
 * Build and show the text modal to the user.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string|null} currentMessage
 */
async function showTextModal(interaction, currentMessage) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CUSTOM_ID)
    .setTitle('Message Control — Text');

  const input = new TextInputBuilder()
    .setCustomId(MODAL_INPUT_CUSTOM_ID)
    .setLabel('Message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter your message here...')
    .setRequired(true)
    .setMaxLength(MAX_MESSAGE_LENGTH);

  if (currentMessage) {
    input.setValue(currentMessage.slice(0, MAX_MESSAGE_LENGTH));
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

/**
 * Handle button interactions for the control panel.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleControlButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  // Cancel button — works even if panel state was lost
  if (customId === 'control_cancel') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '❌ Control panel closed.' });
    return;
  }

  // All other buttons require an active panel owned by this user
  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This control panel is no longer active.', ephemeral: true });
    return;
  }

  if (customId === 'control_text') {
    await showTextModal(interaction, panel.message);
    return;
  }

  if (customId === 'control_send') {
    if (!panel.message) {
      await interaction.reply({ content: '❌ No message is set. Use 📝 Text to enter a message first.', ephemeral: true });
      return;
    }

    try {
      const channel = await interaction.client.channels.fetch(panel.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: '❌ The original channel is no longer available.', ephemeral: true });
        return;
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) {
        await interaction.reply({ content: "❌ I don't have permission to send messages in that channel.", ephemeral: true });
        return;
      }

      await channel.send({
        content: panel.message,
        allowedMentions: { parse: ['everyone', 'roles', 'users'] },
      });
      await interaction.reply({ content: '✅ Message sent.', ephemeral: true });
    } catch (err) {
      console.error('[CONTROL SEND ERROR]', err.message);
      await interaction.reply({ content: '❌ Failed to send the message. The channel may be unavailable or I lack permissions.', ephemeral: true });
    }
    return;
  }
}

/**
 * Handle modal submission for the control panel.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleControlModal(interaction) {
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This control panel is no longer active.', ephemeral: true });
    return;
  }

  const message = interaction.fields.getTextInputValue(MODAL_INPUT_CUSTOM_ID);

  if (!message || message.trim() === '') {
    await interaction.reply({ content: '❌ The message cannot be empty.', ephemeral: true });
    return;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    await interaction.reply({ content: `❌ The message is too long. Discord's limit is ${MAX_MESSAGE_LENGTH} characters.`, ephemeral: true });
    return;
  }

  panel.message = message;

  const embed = buildMessageEmbed(message);
  const row = buildMessageButtons();

  try {
    await interaction.update({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[CONTROL MODAL UPDATE ERROR]', err.message);
    deletePanel(userId, channelId);
    await interaction.reply({ content: '❌ The control panel could not be updated. It has been closed.', ephemeral: true }).catch(() => {});
  }
}

/**
 * Check whether an interaction customId belongs to the control panel system.
 * @param {string} customId
 * @returns {boolean}
 */
export function isControlButton(customId) {
  return customId === 'control_text' || customId === 'control_send' || customId === 'control_cancel';
}

/**
 * Check whether a modal submit interaction belongs to the control panel.
 * @param {string} customId
 * @returns {boolean}
 */
export function isControlModal(customId) {
  return customId === MODAL_CUSTOM_ID;
}

/**
 * Register a new control panel in the in-memory store.
 * Called from the slash command execute after the ephemeral reply is sent.
 * @param {string} userId
 * @param {string} channelId
 */
export function registerPanel(userId, channelId) {
  setPanel(userId, channelId, { userId, channelId, message: null });
}

/**
 * Clean up a panel if the interaction is no longer valid.
 * @param {string} userId
 * @param {string} channelId
 */
export function cleanupPanel(userId, channelId) {
  deletePanel(userId, channelId);
}

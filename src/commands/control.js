import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('control')
  .setDescription('Open a private message control panel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/**
 * Build the initial control panel embed (no message set).
 * @returns {EmbedBuilder}
 */
export function buildInitialEmbed() {
  return new EmbedBuilder()
    .setTitle('Message Control')
    .setDescription('No message set.')
    .setColor(0x2b2d31);
}

/**
 * Build the control panel embed showing the current message.
 * @param {string} message
 * @returns {EmbedBuilder}
 */
export function buildMessageEmbed(message) {
  return new EmbedBuilder()
    .setTitle('Message Control')
    .setDescription(message)
    .setColor(0x2b2d31);
}

/**
 * Build the initial action row (Text + Cancel only).
 * @returns {ActionRowBuilder}
 */
export function buildInitialButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('control_text')
      .setLabel('📝 Text')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('control_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Build the action row after a message is set (Edit Text + Send + Cancel).
 * @returns {ActionRowBuilder}
 */
export function buildMessageButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('control_text')
      .setLabel('📝 Edit Text')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('control_send')
      .setLabel('📤 Send')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('control_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

export async function execute(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  const embed = buildInitialEmbed();
  const row = buildInitialButtons();

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  const { registerPanel } = await import('../components/control-panel.js');
  registerPanel(interaction.user.id, interaction.channelId);
}

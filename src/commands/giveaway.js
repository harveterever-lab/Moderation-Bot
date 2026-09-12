import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
} from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { Giveaway } from '../db/models/Giveaway.js';
import {
  parseDuration,
  generateGiveawayId,
  resolveEmojiIdentifier,
  isValidUrl,
  buildPreviewEmbed,
  formatDuration,
} from '../utils/giveawayHelpers.js';
import { registerGiveawayPreview } from '../components/giveaway-preview.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Manage giveaways.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName('create')
      .setDescription('Create a new giveaway.')
      .addStringOption((opt) => opt.setName('prize').setDescription('The prize for the giveaway').setRequired(true).setMaxLength(256))
      .addIntegerOption((opt) => opt.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(20))
      .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g. 10m, 1h, 7d)').setRequired(true))
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('Channel to post the giveaway in').setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption((opt) => opt.setName('reaction').setDescription('Custom emoji or unicode emoji for entry').setRequired(true))
      .addRoleOption((opt) => opt.setName('required-role').setDescription('Role required to enter').setRequired(false))
      .addStringOption((opt) => opt.setName('image').setDescription('Image URL for the giveaway embed').setRequired(false))
      .addAttachmentOption((opt) => opt.setName('image-attachment').setDescription('Image attachment for the giveaway embed').setRequired(false))
      .addStringOption((opt) => opt.setName('thumbnail').setDescription('Thumbnail URL for the giveaway embed').setRequired(false))
      .addAttachmentOption((opt) => opt.setName('thumbnail-attachment').setDescription('Thumbnail attachment for the giveaway embed').setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit an active giveaway.')
      .addStringOption((opt) => opt.setName('message-id').setDescription('The giveaway message ID').setRequired(true))
      .addStringOption((opt) => opt.setName('prize').setDescription('New prize').setRequired(false).setMaxLength(256))
      .addStringOption((opt) => opt.setName('duration').setDescription('New duration from now (e.g. 1h, 7d)').setRequired(false))
      .addIntegerOption((opt) => opt.setName('winners').setDescription('New number of winners').setRequired(false).setMinValue(1).setMaxValue(20))
      .addStringOption((opt) => opt.setName('reaction').setDescription('New reaction emoji').setRequired(false))
      .addRoleOption((opt) => opt.setName('required-role').setDescription('New required role').setRequired(false))
      .addStringOption((opt) => opt.setName('image').setDescription('New image URL').setRequired(false))
      .addStringOption((opt) => opt.setName('thumbnail').setDescription('New thumbnail URL').setRequired(false)),
  );

/**
 * Handle the /giveaway create subcommand.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The giveaway system requires MongoDB, which is currently unavailable.', ephemeral: true });
    return;
  }

  const prize = interaction.options.getString('prize');
  const winnerCount = interaction.options.getInteger('winners');
  const durationStr = interaction.options.getString('duration');
  const channel = interaction.options.getChannel('channel');
  const reactionInput = interaction.options.getString('reaction');
  const requiredRole = interaction.options.getRole('required-role');
  const imageUrl = interaction.options.getString('image');
  const imageAttachment = interaction.options.getAttachment('image-attachment');
  const thumbnailUrl = interaction.options.getString('thumbnail');
  const thumbnailAttachment = interaction.options.getAttachment('thumbnail-attachment');

  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, `7d`.', ephemeral: true });
    return;
  }

  if (durationMs > 30 * 86_400_000) {
    await interaction.reply({ content: '❌ Duration cannot exceed 30 days.', ephemeral: true });
    return;
  }

  const reaction = resolveEmojiIdentifier(reactionInput);
  if (!reaction) {
    await interaction.reply({ content: '❌ Invalid emoji. Use a custom server emoji or a unicode emoji.', ephemeral: true });
    return;
  }

  let image = null;
  if (imageUrl) {
    if (!isValidUrl(imageUrl)) {
      await interaction.reply({ content: '❌ Invalid image URL. Provide a valid http or https URL.', ephemeral: true });
      return;
    }
    image = imageUrl;
  } else if (imageAttachment) {
    image = imageAttachment.url;
  }

  let thumbnail = null;
  if (thumbnailUrl) {
    if (!isValidUrl(thumbnailUrl)) {
      await interaction.reply({ content: '❌ Invalid thumbnail URL. Provide a valid http or https URL.', ephemeral: true });
      return;
    }
    thumbnail = thumbnailUrl;
  } else if (thumbnailAttachment) {
    thumbnail = thumbnailAttachment.url;
  }

  const previewOptions = {
    prize,
    winnerCount,
    durationMs,
    channelId: channel.id,
    reaction: reactionInput,
    requiredRoleId: requiredRole ? requiredRole.id : null,
    image,
    thumbnail,
  };

  const embed = buildPreviewEmbed(previewOptions);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway_confirm').setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('giveaway_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  registerGiveawayPreview(interaction.user.id, interaction.channelId, {
    giveawayId: generateGiveawayId(),
    guildId: interaction.guild.id,
    channelId: channel.id,
    hostId: interaction.user.id,
    prize,
    winnerCount,
    durationMs,
    reaction,
    reactionDisplay: reactionInput,
    requiredRoleId: requiredRole ? requiredRole.id : null,
    image,
    thumbnail,
  });
}

/**
 * Handle the /giveaway edit subcommand.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleEdit(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  if (!isDatabaseConnected()) {
    await interaction.reply({ content: '❌ The giveaway system requires MongoDB, which is currently unavailable.', ephemeral: true });
    return;
  }

  const messageId = interaction.options.getString('message-id');
  const newPrize = interaction.options.getString('prize');
  const newDurationStr = interaction.options.getString('duration');
  const newWinnerCount = interaction.options.getInteger('winners');
  const newReactionInput = interaction.options.getString('reaction');
  const newRequiredRole = interaction.options.getRole('required-role');
  const newImageUrl = interaction.options.getString('image');
  const newThumbnailUrl = interaction.options.getString('thumbnail');

  let giveaway;
  try {
    giveaway = await Giveaway.findOne({ guildId: interaction.guild.id, messageId });
  } catch (err) {
    console.error('[GIVEAWAY EDIT ERROR]', err.message);
    await interaction.reply({ content: '❌ Could not search for the giveaway. Please try again.', ephemeral: true });
    return;
  }

  if (!giveaway) {
    await interaction.reply({ content: '❌ No giveaway found with that message ID.', ephemeral: true });
    return;
  }

  if (giveaway.status !== 'active') {
    await interaction.reply({ content: `❌ This giveaway is already ${giveaway.status}. You can only edit active giveaways.`, ephemeral: true });
    return;
  }

  let newDurationMs = null;
  if (newDurationStr) {
    newDurationMs = parseDuration(newDurationStr);
    if (!newDurationMs) {
      await interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, `7d`.', ephemeral: true });
      return;
    }
  }

  let newReaction = null;
  if (newReactionInput) {
    newReaction = resolveEmojiIdentifier(newReactionInput);
    if (!newReaction) {
      await interaction.reply({ content: '❌ Invalid emoji.', ephemeral: true });
      return;
    }
  }

  if (newImageUrl !== null && !isValidUrl(newImageUrl)) {
    await interaction.reply({ content: '❌ Invalid image URL.', ephemeral: true });
    return;
  }

  if (newThumbnailUrl !== null && !isValidUrl(newThumbnailUrl)) {
    await interaction.reply({ content: '❌ Invalid thumbnail URL.', ephemeral: true });
    return;
  }

  // Apply changes
  if (newPrize) giveaway.prize = newPrize;
  if (newWinnerCount) giveaway.winnerCount = newWinnerCount;
  if (newDurationMs) giveaway.endTime = new Date(Date.now() + newDurationMs);
  if (newReaction) giveaway.reaction = newReaction;
  if (newRequiredRole !== null) giveaway.requiredRoleId = newRequiredRole ? newRequiredRole.id : null;
  if (newImageUrl !== null) giveaway.image = newImageUrl || null;
  if (newThumbnailUrl !== null) giveaway.thumbnail = newThumbnailUrl || null;

  try {
    await giveaway.save();
  } catch (err) {
    console.error('[GIVEAWAY EDIT SAVE ERROR]', err.message);
    await interaction.reply({ content: '❌ Failed to save the giveaway changes.', ephemeral: true });
    return;
  }

  // Update the giveaway message
  try {
    const channel = await interaction.client.channels.fetch(giveaway.channelId);
    if (!channel) {
      await interaction.reply({ content: '❌ The giveaway channel could not be found.', ephemeral: true });
      return;
    }

    const message = await channel.messages.fetch(giveaway.messageId);
    if (!message) {
      await interaction.reply({ content: '❌ The giveaway message could not be found.', ephemeral: true });
      return;
    }

    const { buildGiveawayEmbed } = await import('../utils/giveawayHelpers.js');
    const hostUser = await interaction.client.users.fetch(giveaway.hostId).catch(() => null);
    const embed = buildGiveawayEmbed(giveaway, giveaway.participantIds.length, hostUser);
    await message.edit({ embeds: [embed] });

    // Handle reaction emoji change
    if (newReaction && newReaction !== giveaway.reaction) {
      // Remove all old reactions and add the new one
      await message.reactions.removeAll().catch(() => {});
      await message.react(giveaway.reaction).catch(() => {});
      // Clear participants since the emoji changed
      giveaway.participantIds = [];
      await giveaway.save();
    }
  } catch (err) {
    console.error('[GIVEAWAY EDIT MESSAGE ERROR]', err.message);
    await interaction.reply({ content: '❌ Failed to update the giveaway message. The database was updated but the message may be stale.', ephemeral: true });
    return;
  }

  // Reschedule the timer if end time changed
  const { rescheduleGiveawayTimer } = await import('../utils/giveawayManager.js');
  rescheduleGiveawayTimer(giveaway, interaction.client);

  await interaction.reply({ content: '✅ Giveaway updated successfully.', ephemeral: true });
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'create') {
    await handleCreate(interaction);
  } else if (subcommand === 'edit') {
    await handleEdit(interaction);
  }
}

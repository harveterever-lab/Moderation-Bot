import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';

const AUTHORIZED_USER_ID = '1505729763296411891';

export const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Send a custom embed message.')
  .addStringOption((opt) =>
    opt.setName('text').setDescription('The embed description text').setRequired(true).setMaxLength(4096),
  )
  .addStringOption((opt) =>
    opt.setName('color').setDescription('Embed color as a hex code (e.g. #006400)').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('image').setDescription('Image URL for the embed').setRequired(false),
  )
  .addStringOption((opt) =>
    opt.setName('footer').setDescription('Footer text for the embed').setRequired(false).setMaxLength(2048),
  )
  .addBooleanOption((opt) =>
    opt.setName('timestamp').setDescription('Add the current timestamp to the embed').setRequired(false),
  );

/**
 * Parse a hex color string into a numeric color value.
 * Accepts formats: "#006400", "006400", "#00FF00".
 * Returns null if invalid.
 * @param {string} input
 * @returns {number|null}
 */
function parseHexColor(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

/**
 * Basic URL validation for the image option.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function execute(interaction) {
  const { member, user } = interaction;

  // Administrator OR authorized user — NOT the server-owner check
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const isAuthorized = user.id === AUTHORIZED_USER_ID;

  if (!isAdmin && !isAuthorized) {
    await interaction.reply({ content: '❌ You need Administrator permission to use this command.', ephemeral: true });
    return;
  }

  const text = interaction.options.getString('text');
  const colorInput = interaction.options.getString('color');
  const imageUrl = interaction.options.getString('image');
  const footerText = interaction.options.getString('footer');
  const addTimestamp = interaction.options.getBoolean('timestamp');

  // Validate color if provided
  let color = 0x2ECC71; // default green
  if (colorInput) {
    const parsed = parseHexColor(colorInput);
    if (parsed === null) {
      await interaction.reply({ content: '❌ Invalid color. Use a valid hex code like `#006400` or `#5865F2`.', ephemeral: true });
      return;
    }
    color = parsed;
  }

  // Validate image URL if provided
  if (imageUrl && !isValidUrl(imageUrl)) {
    await interaction.reply({ content: '❌ Invalid image URL. Please provide a valid http or https URL.', ephemeral: true });
    return;
  }

  // Build the embed
  const embed = new EmbedBuilder().setDescription(text).setColor(color);

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  if (footerText) {
    embed.setFooter({ text: footerText });
  }

  if (addTimestamp) {
    embed.setTimestamp();
  }

  // Send the embed to the channel first — success message only after it sends
  try {
    await interaction.channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[EMBED ERROR] Failed to send embed:', err.message);
    await interaction.reply({ content: '❌ Failed to send the embed. Check my permissions and try again.', ephemeral: true });
    return;
  }

  // Only now confirm success
  await interaction.reply({ content: '✅ Embed sent successfully.', ephemeral: true });
}

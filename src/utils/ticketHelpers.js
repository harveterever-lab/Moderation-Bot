import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';

const STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

export function resolveStyle(style) {
  return STYLE_MAP[style] || ButtonStyle.Primary;
}

export function replacePlaceholders(text, user, username, typeName) {
  if (!text) return '';
  return text
    .replace(/\{user\}/g, user || '')
    .replace(/\{username\}/g, username || '')
    .replace(/\{type\}/g, typeName || '');
}

export function sanitizeChannelName(username) {
  const cleaned = (username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20) || 'user';
  return `ticket-${cleaned}`;
}

export function buildPanelEmbed(panel) {
  return new EmbedBuilder()
    .setTitle(panel.title)
    .setDescription(panel.description)
    .setColor(0x2b2d31);
}

export function buildPanelButtons(panel) {
  const rows = [];
  const buttons = [];
  for (const btn of panel.buttons) {
    const builder = new ButtonBuilder()
      .setCustomId(`ticket_create:${btn.typeId}`)
      .setLabel(btn.name)
      .setStyle(resolveStyle(btn.style));
    if (btn.emoji && btn.emoji.trim()) builder.setEmoji(btn.emoji.trim());
    buttons.push(builder);
  }
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

export function buildInsideEmbed(panel, user, username, typeName) {
  const embed = new EmbedBuilder()
    .setTitle(replacePlaceholders(panel.insideTitle, user, username, typeName))
    .setDescription(replacePlaceholders(panel.insideDescription, user, username, typeName))
    .setColor(parseInt(panel.insideColor.replace('#', ''), 16) || 0x2b2d31);
  const footer = replacePlaceholders(panel.insideFooter, user, username, typeName);
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

export function buildCloseButton(panel) {
  const btn = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel(panel.closeButtonName)
    .setStyle(ButtonStyle.Danger);
  if (panel.closeButtonEmoji && panel.closeButtonEmoji.trim()) btn.setEmoji(panel.closeButtonEmoji.trim());
  return new ActionRowBuilder().addComponents(btn);
}

export function isValidColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) || /^[0-9a-fA-F]{6}$/.test(color);
}

export function isValidEmoji(emoji) {
  if (!emoji || emoji.trim() === '') return true;
  const trimmed = emoji.trim();
  if (/^<a?:\w+:\d+$/.test(trimmed)) return true;
  if (/^\p{Extended_Pictographic}$/u.test(trimmed)) return true;
  return false;
}

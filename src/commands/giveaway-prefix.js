import { PermissionFlagsBits } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { Giveaway } from '../db/models/Giveaway.js';
import { isOwnerOrAuthorized, selectWinners } from '../utils/giveawayHelpers.js';
import {
  endGiveaway,
  cancelGiveaway,
  rerollGiveaway,
} from '../utils/giveawayManager.js';
import { sendModLog } from '../utils/logger.js';
import { getGuildConfig } from '../config.js';

const PREFIX = 'R!';
const AUTHORIZED_USER_ID = '1505729763296411891';

/**
 * Handle all giveaway-related prefix commands:
 * - R! giveaway end <message_id>
 * - R! giveaway cancel <message_id>
 * - R! giveaway reroll <message_id>
 * - R! Pick <giveaway_id> <user>
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if this handler processed the message
 */
export async function handleGiveawayPrefix(message) {
  if (!message.content.startsWith(PREFIX)) return false;

  const content = message.content.slice(PREFIX.length).trim();
  const lower = content.toLowerCase();

  // R! giveaway end <message_id>
  if (lower.startsWith('giveaway end ')) {
    await handleGiveawayEnd(message);
    return true;
  }

  // R! giveaway cancel <message_id>
  if (lower.startsWith('giveaway cancel ')) {
    await handleGiveawayCancel(message);
    return true;
  }

  // R! giveaway reroll <message_id>
  if (lower.startsWith('giveaway reroll ')) {
    await handleGiveawayReroll(message);
    return true;
  }

  // R! Pick <giveaway_id> <user>
  if (lower.startsWith('pick ')) {
    await handlePick(message);
    return true;
  }

  return false;
}

/**
 * Check if the user is an administrator or the authorized user.
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
function isAdminOrAuthorized(message) {
  if (message.author.id === AUTHORIZED_USER_ID) return true;
  if (message.member && message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

/**
 * R! giveaway end <message_id>
 */
async function handleGiveawayEnd(message) {
  if (!isAdminOrAuthorized(message)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The giveaway system requires MongoDB, which is currently unavailable.');
    return;
  }

  const messageId = message.content.slice(PREFIX.length).trim().slice('giveaway end '.length).trim();
  if (!messageId) {
    await message.reply('❌ Usage: `R! giveaway end <message_id>`');
    return;
  }

  let giveaway;
  try {
    giveaway = await Giveaway.findOne({ guildId: message.guild.id, messageId });
  } catch (err) {
    console.error('[GIVEAWAY END ERROR]', err.message);
    await message.reply('❌ Could not search for the giveaway.');
    return;
  }

  if (!giveaway) {
    await message.reply('❌ No giveaway found with that message ID.');
    return;
  }

  if (giveaway.status === 'ended') {
    await message.reply('❌ This giveaway has already ended.');
    return;
  }

  if (giveaway.status === 'cancelled') {
    await message.reply('❌ This giveaway was cancelled.');
    return;
  }

  await endGiveaway(giveaway, message.client, false);
  await message.reply('✅ Giveaway ended. Winners have been announced and DMed.');
}

/**
 * R! giveaway cancel <message_id>
 */
async function handleGiveawayCancel(message) {
  if (!isAdminOrAuthorized(message)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The giveaway system requires MongoDB, which is currently unavailable.');
    return;
  }

  const messageId = message.content.slice(PREFIX.length).trim().slice('giveaway cancel '.length).trim();
  if (!messageId) {
    await message.reply('❌ Usage: `R! giveaway cancel <message_id>`');
    return;
  }

  let giveaway;
  try {
    giveaway = await Giveaway.findOne({ guildId: message.guild.id, messageId });
  } catch (err) {
    console.error('[GIVEAWAY CANCEL ERROR]', err.message);
    await message.reply('❌ Could not search for the giveaway.');
    return;
  }

  if (!giveaway) {
    await message.reply('❌ No giveaway found with that message ID.');
    return;
  }

  if (giveaway.status === 'ended') {
    await message.reply('❌ This giveaway has already ended. Use `R! giveaway reroll` instead.');
    return;
  }

  if (giveaway.status === 'cancelled') {
    await message.reply('❌ This giveaway was already cancelled.');
    return;
  }

  await cancelGiveaway(giveaway, message.client);
  await message.reply('✅ Giveaway cancelled. No winners were selected.');
}

/**
 * R! giveaway reroll <message_id>
 */
async function handleGiveawayReroll(message) {
  if (!isAdminOrAuthorized(message)) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The giveaway system requires MongoDB, which is currently unavailable.');
    return;
  }

  const messageId = message.content.slice(PREFIX.length).trim().slice('giveaway reroll '.length).trim();
  if (!messageId) {
    await message.reply('❌ Usage: `R! giveaway reroll <message_id>`');
    return;
  }

  let giveaway;
  try {
    giveaway = await Giveaway.findOne({ guildId: message.guild.id, messageId });
  } catch (err) {
    console.error('[GIVEAWAY REROLL ERROR]', err.message);
    await message.reply('❌ Could not search for the giveaway.');
    return;
  }

  if (!giveaway) {
    await message.reply('❌ No giveaway found with that message ID.');
    return;
  }

  if (giveaway.status !== 'ended') {
    await message.reply('❌ You can only reroll ended giveaways.');
    return;
  }

  const newWinners = await rerollGiveaway(giveaway, message.client);

  if (newWinners === null) {
    await message.reply('❌ Could not reroll. Make sure the giveaway has ended.');
    return;
  }

  if (newWinners.length === 0) {
    await message.reply('❌ No eligible participants available for reroll.');
    return;
  }

  await message.reply(`✅ Rerolled! New winner(s): ${newWinners.map((w) => `<@${w.id}>`).join(', ')}`);
}

/**
 * R! Pick <giveaway_id> <user>
 * Server-owner-only override command.
 */
async function handlePick(message) {
  // Strict owner-only check
  if (!isOwnerOrAuthorized(message)) {
    await message.reply('❌ This command is restricted to the server owner only.');
    return;
  }

  if (!isDatabaseConnected()) {
    await message.reply('❌ The giveaway system requires MongoDB, which is currently unavailable.');
    return;
  }

  const args = message.content.slice(PREFIX.length).trim().slice('pick '.length).trim().split(/\s+/);
  if (args.length < 2) {
    await message.reply('❌ Usage: `R! Pick <giveaway_id> <user>`');
    return;
  }

  const giveawayId = args[0];
  const userArg = args.slice(1).join(' ');

  // Resolve the target user — mention, ID, or username
  let targetUserId = null;

  // Try mention first
  const mentionMatch = userArg.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    targetUserId = mentionMatch[1];
  } else if (/^\d+$/.test(userArg)) {
    targetUserId = userArg;
  } else {
    // Try fetching by username
    try {
      const members = await message.guild.members.search({ query: userArg, limit: 1 });
      if (members.size > 0) {
        targetUserId = members.first().id;
      }
    } catch {
      // Fall through
    }
  }

  if (!targetUserId) {
    await message.reply('❌ Could not find that user. Use a mention, user ID, or username.');
    return;
  }

  let giveaway;
  try {
    giveaway = await Giveaway.findOne({ guildId: message.guild.id, giveawayId });
  } catch (err) {
    console.error('[GIVEAWAY PICK ERROR]', err.message);
    await message.reply('❌ Could not search for the giveaway.');
    return;
  }

  if (!giveaway) {
    // Also try by message ID
    try {
      giveaway = await Giveaway.findOne({ guildId: message.guild.id, messageId: giveawayId });
    } catch {
      // Fall through
    }
  }

  if (!giveaway) {
    await message.reply('❌ No giveaway found with that ID.');
    return;
  }

  if (giveaway.status !== 'active') {
    await message.reply(`❌ This giveaway is ${giveaway.status}. You can only pick from active giveaways.`);
    return;
  }

  if (!giveaway.participantIds.includes(targetUserId)) {
    await message.reply('❌ The specified user has not entered this giveaway.');
    return;
  }

  // Add the user as a manual winner
  if (!giveaway.manualWinnerIds.includes(targetUserId)) {
    giveaway.manualWinnerIds.push(targetUserId);
  }

  // If the number of manual winners exceeds winnerCount, keep only the first winnerCount
  if (giveaway.manualWinnerIds.length > giveaway.winnerCount) {
    giveaway.manualWinnerIds = giveaway.manualWinnerIds.slice(0, giveaway.winnerCount);
  }

  await giveaway.save();

  // Log the override
  const config = getGuildConfig(message.guild.id);
  try {
    const targetUser = await message.client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) {
      await sendModLog(message.guild, {
        logChannelId: config.logChannelId,
        title: '🎯 Giveaway Manual Pick',
        color: 0xf1c40f,
        targetUser,
        moderatorUser: message.author,
        reason: `Giveaway ID: ${giveaway.giveawayId} — Prize: ${giveaway.prize}`,
      });
    }
  } catch {
    // Logging is best-effort
  }

  const targetUserMention = `<@${targetUserId}>`;
  await message.reply(`✅ ${targetUserMention} has been manually selected as a winner for **${giveaway.prize}**. They will be included when the giveaway ends.`);
}

import { Giveaway } from '../db/models/Giveaway.js';
import { isDatabaseConnected } from '../db/database.js';
import {
  buildEndedEmbed,
  buildCancelledEmbed,
  selectWinners,
} from './giveawayHelpers.js';

/**
 * In-memory map of active giveaway timers.
 * Keyed by giveawayId to prevent duplicates.
 * @type {Map<string, {timeout: NodeJS.Timeout, giveawayId: string}>}
 */
const activeTimers = new Map();

/**
 * End a giveaway: select winners, update the embed, announce, DM winners.
 * @param {import('mongoose').Document} giveaway - The giveaway document
 * @param {import('discord.js').Client} client
 * @param {boolean} [isAuto] - Whether this is an automatic end (vs manual)
 */
export async function endGiveaway(giveaway, client, isAuto = false) {
  if (giveaway.status !== 'active') return;

  try {
    // Atomically transition active -> ended
    const updated = await Giveaway.findOneAndUpdate(
      { _id: giveaway._id, status: 'active' },
      { status: 'ended' },
      { new: true },
    );

    if (!updated) {
      // Already ended or cancelled by another process
      return;
    }

    Object.assign(giveaway, updated.toObject());

    // Clear the timer
    clearTimer(giveaway.giveawayId);

    // Select winners from participants
    const eligibleIds = [...giveaway.participantIds];

    // Include manual winner IDs in the winner pool
    let winnerIds = [];

    if (giveaway.manualWinnerIds && giveaway.manualWinnerIds.length > 0) {
      // Use manual winners first, then fill remaining slots randomly
      const manualWinners = giveaway.manualWinnerIds.filter((id) => eligibleIds.includes(id));
      winnerIds.push(...manualWinners);

      const remaining = giveaway.winnerCount - winnerIds.length;
      if (remaining > 0) {
        const randomWinners = selectWinners(eligibleIds, remaining, winnerIds);
        winnerIds.push(...randomWinners);
      }
    } else {
      winnerIds = selectWinners(eligibleIds, giveaway.winnerCount);
    }

    giveaway.winnerIds = winnerIds;
    await giveaway.save();

    // Fetch winner user objects
    const winners = [];
    for (const id of winnerIds) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) winners.push(user);
    }

    // Update the giveaway message
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (message) {
          const hostUser = await client.users.fetch(giveaway.hostId).catch(() => null);
          const embed = buildEndedEmbed(giveaway, winners, hostUser);
          await message.edit({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error('[GIVEAWAY END] Failed to update message:', err.message);
    }

    // Announce winners in the channel
    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel) {
        if (winners.length > 0) {
          const mentions = winners.map((w) => `<@${w.id}>`).join(' ');
          await channel.send(`🎉 Congratulations ${mentions}! You won **${giveaway.prize}**!`);
        } else {
          await channel.send(`🎉 The giveaway for **${giveaway.prize}** has ended, but no valid winners could be selected.`);
        }
      }
    } catch (err) {
      console.error('[GIVEAWAY END] Failed to announce winners:', err.message);
    }

    // DM the winners
    for (const winner of winners) {
      try {
        await winner.send(`🎉 Congratulations! You won **${giveaway.prize}** in the giveaway!`);
      } catch (err) {
        console.error(`[GIVEAWAY END] Failed to DM winner ${winner.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[GIVEAWAY END ERROR]', err.message);
  }
}

/**
 * Cancel a giveaway: update the embed, prevent further entries.
 * @param {import('mongoose').Document} giveaway - The giveaway document
 * @param {import('discord.js').Client} client
 */
export async function cancelGiveaway(giveaway, client) {
  if (giveaway.status !== 'active') return;

  try {
    const updated = await Giveaway.findOneAndUpdate(
      { _id: giveaway._id, status: 'active' },
      { status: 'cancelled' },
      { new: true },
    );

    if (!updated) return;

    Object.assign(giveaway, updated.toObject());

    clearTimer(giveaway.giveawayId);

    try {
      const channel = await client.channels.fetch(giveaway.channelId);
      if (channel) {
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (message) {
          const hostUser = await client.users.fetch(giveaway.hostId).catch(() => null);
          const embed = buildCancelledEmbed(giveaway, hostUser);
          await message.edit({ embeds: [embed] });
        }
      }
    } catch (err) {
      console.error('[GIVEAWAY CANCEL] Failed to update message:', err.message);
    }
  } catch (err) {
    console.error('[GIVEAWAY CANCEL ERROR]', err.message);
  }
}

/**
 * Reroll winners for an ended giveaway.
 * @param {import('mongoose').Document} giveaway - The giveaway document
 * @param {import('discord.js').Client} client
 * @param {number} [count] - Number of new winners to reroll (defaults to winnerCount)
 * @returns {Promise<import('discord.js').User[]|null>} New winners, or null if not possible
 */
export async function rerollGiveaway(giveaway, client, count) {
  if (giveaway.status !== 'ended') return null;

  const rerollCount = count || giveaway.winnerCount;
  const eligibleIds = [...giveaway.participantIds];
  const previousWinners = [...giveaway.winnerIds];

  const newWinnerIds = selectWinners(eligibleIds, rerollCount, previousWinners);

  if (newWinnerIds.length === 0) return [];

  // Add new winners to the list
  giveaway.winnerIds = [...giveaway.winnerIds, ...newWinnerIds];
  await giveaway.save();

  // Fetch user objects
  const newWinners = [];
  for (const id of newWinnerIds) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) newWinners.push(user);
  }

  // Announce
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    if (channel) {
      const mentions = newWinners.map((w) => `<@${w.id}>`).join(' ');
      await channel.send(`🎉 Reroll! New winner(s): ${mentions} — You won **${giveaway.prize}**!`);
    }
  } catch (err) {
    console.error('[GIVEAWAY REROLL] Failed to announce:', err.message);
  }

  // DM new winners
  for (const winner of newWinners) {
    try {
      await winner.send(`🎉 Congratulations! You won **${giveaway.prize}** in the rerolled giveaway!`);
    } catch (err) {
      console.error(`[GIVEAWAY REROLL] Failed to DM winner ${winner.id}:`, err.message);
    }
  }

  return newWinners;
}

/**
 * Clear a giveaway timer.
 * @param {string} giveawayId
 */
function clearTimer(giveawayId) {
  const entry = activeTimers.get(giveawayId);
  if (entry) {
    clearTimeout(entry.timeout);
    activeTimers.delete(giveawayId);
  }
}

/**
 * Schedule a giveaway end timer.
 * @param {import('mongoose').Document} giveaway - The giveaway document
 * @param {import('discord.js').Client} client
 */
export function scheduleGiveawayTimer(giveaway, client) {
  if (giveaway.status !== 'active') return;

  // Clear existing timer for this giveaway to avoid duplicates
  clearTimer(giveaway.giveawayId);

  const endTime = new Date(giveaway.endTime).getTime();
  const delay = endTime - Date.now();

  if (delay <= 0) {
    // Already past end time — end immediately
    endGiveaway(giveaway, client, true);
    return;
  }

  const timeout = setTimeout(() => {
    endGiveaway(giveaway, client, true);
  }, delay);

  activeTimers.set(giveaway.giveawayId, { timeout, giveawayId: giveaway.giveawayId });
}

/**
 * Reschedule a giveaway timer (used after editing).
 * @param {import('mongoose').Document} giveaway - The giveaway document
 * @param {import('discord.js').Client} client
 */
export function rescheduleGiveawayTimer(giveaway, client) {
  scheduleGiveawayTimer(giveaway, client);
}

/**
 * Load all active giveaways from MongoDB and schedule their timers.
 * Called on bot startup for restart recovery.
 * @param {import('discord.js').Client} client
 */
export async function recoverGiveaways(client) {
  if (!isDatabaseConnected()) return;

  try {
    const activeGiveaways = await Giveaway.find({ status: 'active' });
    console.log(`[GIVEAWAY] Recovering ${activeGiveaways.length} active giveaway(s).`);

    for (const giveaway of activeGiveaways) {
      scheduleGiveawayTimer(giveaway, client);
    }
  } catch (err) {
    console.error('[GIVEAWAY RECOVERY ERROR]', err.message);
  }
}

/**
 * Get the active timers map size (for debugging).
 * @returns {number}
 */
export function getActiveTimerCount() {
  return activeTimers.size;
}

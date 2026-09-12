import { Events, Partials } from 'discord.js';
import { isDatabaseConnected } from '../db/database.js';
import { Giveaway } from '../db/models/Giveaway.js';

/**
 * Check if a reaction emoji matches the giveaway's configured reaction.
 * @param {import('discord.js').Reaction} reaction
 * @param {string} expectedReaction - The stored reaction identifier
 * @returns {boolean}
 */
function reactionMatches(reaction, expectedReaction) {
  const emoji = reaction.emoji;

  // Custom emoji: compare by ID
  if (emoji.id) {
    return emoji.id === expectedReaction;
  }

  // Unicode emoji: compare the identifier
  return emoji.name === expectedReaction;
}

/**
 * Check if a user is eligible to enter a giveaway (required role check).
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 * @param {string|null} requiredRoleId
 * @returns {Promise<{eligible: boolean, reason: string|null}>}
 */
async function checkEligibility(guild, userId, requiredRoleId) {
  if (!requiredRoleId) return { eligible: true, reason: null };

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    return { eligible: false, reason: 'Could not verify membership.' };
  }

  if (!member) {
    return { eligible: false, reason: 'Member not found.' };
  }

  if (!member.roles.cache.has(requiredRoleId)) {
    return { eligible: false, reason: 'Missing required role.' };
  }

  return { eligible: true, reason: null };
}

/**
 * Register the giveaway reaction listeners on the client.
 * Uses the existing messageReactionAdd and messageReactionRemove events.
 * @param {import('discord.js').Client} client
 */
export function registerGiveawayReactionHandlers(client) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      // Ignore bot reactions
      if (user.bot) return;

      // Partial handling — fetch if needed
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }

      if (!reaction.message.guildId) return;

      if (!isDatabaseConnected()) return;

      // Find the giveaway by message ID
      let giveaway;
      try {
        giveaway = await Giveaway.findOne({
          guildId: reaction.message.guildId,
          messageId: reaction.message.id,
          status: 'active',
        });
      } catch {
        return;
      }

      if (!giveaway) return;

      // Check if the reaction matches
      if (!reactionMatches(reaction, giveaway.reaction)) return;

      // Check eligibility (required role)
      const { eligible } = await checkEligibility(reaction.message.guild, user.id, giveaway.requiredRoleId);

      if (!eligible) {
        // Remove the reaction if the user doesn't meet the role requirement
        try {
          await reaction.users.remove(user.id);
        } catch {
          // May lack permission
        }
        return;
      }

      // Add to participants if not already present
      if (!giveaway.participantIds.includes(user.id)) {
        giveaway.participantIds.push(user.id);
        await giveaway.save();
      }
    } catch (err) {
      console.error('[GIVEAWAY REACTION ADD ERROR]', err.message);
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      if (user.bot) return;

      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }

      if (!reaction.message.guildId) return;

      if (!isDatabaseConnected()) return;

      let giveaway;
      try {
        giveaway = await Giveaway.findOne({
          guildId: reaction.message.guildId,
          messageId: reaction.message.id,
          status: 'active',
        });
      } catch {
        return;
      }

      if (!giveaway) return;

      if (!reactionMatches(reaction, giveaway.reaction)) return;

      // Remove from participants
      if (giveaway.participantIds.includes(user.id)) {
        giveaway.participantIds = giveaway.participantIds.filter((id) => id !== user.id);
        await giveaway.save();
      }
    } catch (err) {
      console.error('[GIVEAWAY REACTION REMOVE ERROR]', err.message);
    }
  });

  // Handle users leaving the server — clean up their entries
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (!isDatabaseConnected()) return;

      const giveaways = await Giveaway.find({
        guildId: member.guild.id,
        status: 'active',
        participantIds: member.id,
      });

      for (const giveaway of giveaways) {
        giveaway.participantIds = giveaway.participantIds.filter((id) => id !== member.id);
        await giveaway.save();
      }
    } catch (err) {
      console.error('[GIVEAWAY MEMBER REMOVE ERROR]', err.message);
    }
  });
}

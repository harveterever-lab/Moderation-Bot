import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const giveawaySchema = new Schema(
  {
    giveawayId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    hostId: { type: String, required: true },
    prize: { type: String, required: true },
    winnerCount: { type: Number, required: true, min: 1 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    reaction: { type: String, required: true },
    requiredRoleId: { type: String, default: null },
    image: { type: String, default: null },
    thumbnail: { type: String, default: null },
    participantIds: { type: [String], default: [] },
    winnerIds: { type: [String], default: [] },
    manualWinnerIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['active', 'ended', 'cancelled'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true },
);

export const Giveaway = model('Giveaway', giveawaySchema);

export default mongoose;

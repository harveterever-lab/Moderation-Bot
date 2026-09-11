import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const buttonSchema = new Schema(
  {
    typeId: { type: String, required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '' },
    style: { type: String, required: true, enum: ['Primary', 'Secondary', 'Success', 'Danger'] },
    limit: { type: String, required: true },
  },
  { _id: false },
);

const ticketPanelSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    staffRoleId: { type: String, required: true },
    insideTitle: { type: String, required: true },
    insideDescription: { type: String, required: true },
    insideColor: { type: String, required: true },
    insideFooter: { type: String, default: '' },
    closeButtonName: { type: String, required: true },
    closeButtonEmoji: { type: String, default: '' },
    buttons: {
      type: [buttonSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 5,
    },
  },
  { timestamps: true },
);

export const TicketPanel = model('TicketPanel', ticketPanelSchema);

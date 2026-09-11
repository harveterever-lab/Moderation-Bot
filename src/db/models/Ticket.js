import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ticketSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    typeId: { type: String, required: true },
    typeName: { type: String, required: true },
    status: { type: String, required: true, enum: ['open', 'closed'], default: 'open', index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ticketSchema.index({ guildId: 1, ownerId: 1, status: 1 });
ticketSchema.index({ guildId: 1, typeId: 1, status: 1 });

export const Ticket = model('Ticket', ticketSchema);

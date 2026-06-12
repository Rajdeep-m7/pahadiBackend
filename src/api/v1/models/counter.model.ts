import mongoose, { Schema, Document } from 'mongoose';

// Define the raw data structure
export interface ICounter {
  _id: string; // The name of the sequence (e.g., 'orderId')
  seq: number;
}

/**
 * Use Omit to remove the conflicting _id property from Document.
 * This allows us to define _id as a string without TypeScript errors.
 */
export interface ICounterDocument extends ICounter, Omit<Document, '_id'> {}

// Define the Schema without the generic type parameter to avoid strict definition checks
const CounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounterDocument>('Counter', CounterSchema);

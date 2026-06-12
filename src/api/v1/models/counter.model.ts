import mongoose, { Schema, Document } from 'mongoose';

// Define the raw data structure
export interface ICounter {
  _id: string; // The name of the sequence (e.g., 'orderId')
  seq: number;
}

// Define the Document type for Mongoose
export interface ICounterDocument extends ICounter, Document {
  _id: string; // Override Document _id with string
}

const CounterSchema = new Schema<ICounterDocument>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounterDocument>('Counter', CounterSchema);

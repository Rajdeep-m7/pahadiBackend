import mongoose, { Schema, Document } from 'mongoose';
import { ICategory } from '../interfaces/category.interface';

export interface ICategoryDocument extends ICategory, Document {}

const AttributeFilterSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

const CategorySchema = new Schema<ICategoryDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true },
    imagePublicId: { type: String, required: true },
    iconUrl: { type: String },
    iconPublicId: { type: String },
    parentCategoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    taxes: [{
      name: { type: String, required: true },
      slab: { type: Number, required: true },
    }],
    filterConfig: {
      type: {
        enabled: { type: Boolean, default: true },
        attributeFilters: [AttributeFilterSchema],
        excludeFromSearch: { type: Boolean, default: false },
      },
      default: () => ({ enabled: true, attributeFilters: [], excludeFromSearch: false }),
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model<ICategoryDocument>('Category', CategorySchema);

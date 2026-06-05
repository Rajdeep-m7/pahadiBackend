import mongoose from "mongoose";
import { IReview } from "../interfaces/reviews.interface";

export interface IReviewDocument extends Omit<IReview, 'userId' | 'productId'>, mongoose.Document {
    userId: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
}

const ReviewSchema = new mongoose.Schema<IReviewDocument>({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    images: [
        {
            url: { type: String, required: true },
            publicId: { type: String, required: true }
        }
    ]
}, {
    timestamps: true
})

export const Review = mongoose.model<IReviewDocument>("Review", ReviewSchema);
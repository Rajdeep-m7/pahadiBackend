export interface IReview {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string;
  images: { url: string; publicId: string }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt:Date;
}
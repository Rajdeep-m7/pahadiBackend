import { Types } from 'mongoose';

export interface IAttributeFilter {
  key: string;
  label: string;
  displayOrder: number;
}

export interface IFilterConfig {
  enabled: boolean;
  attributeFilters: IAttributeFilter[];
  excludeFromSearch: boolean;
}

export interface ICategory {
  name: string;
  slug: string;
  imageUrl: string;
  imagePublicId: string;
  iconUrl?: string;
  iconPublicId?: string;
  parentCategoryId?: Types.ObjectId | null;
  taxes?: { name: string; slab: number }[];
  filterConfig?: IFilterConfig;
  children?: ICategory[];
  effectiveTax?: { name: string; slab: number }[] | null;
}

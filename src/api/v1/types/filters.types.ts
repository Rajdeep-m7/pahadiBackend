export interface IBrandFilter {
  id: string;
  name: string;
  count: number;
}

export interface IPriceRange {
  min: number;
  max: number;
}

export interface IAttributeValue {
  value: string;
  count: number;
}

export interface IAttributeFilterResult {
  label: string;
  values: IAttributeValue[];
}

export interface ISubcategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  children?: ISubcategory[];
}

export interface ICategoryFilters {
  category: {
    id: string;
    name: string;
    slug: string;
  };
  filters: {
    brands: IBrandFilter[];
    priceRange: IPriceRange;
    attributes?: IAttributeFilterResult[];
  };
  subcategories: ISubcategory[];
  cachedAt: string;
  expiresAt: string;
}

export interface ISearchFilters {
  filters: {
    brands: IBrandFilter[];
    priceRange: IPriceRange;
  };
  cachedAt: string;
}
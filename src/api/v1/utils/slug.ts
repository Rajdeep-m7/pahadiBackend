import { Model } from 'mongoose';

/**
 * Basic slugify helper. Handles strings or arrays of strings.
 */
export const slugify = (text: string | string[]): string => {
  const input = Array.isArray(text) ? text.join('-') : text;
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-'); // Replace multiple - with single -
};

/**
 * Generates a unique slug for a given model and field
 */
export const generateUniqueSlug = async (
  baseText: string | string[],
  model: Model<any>,
  field: string = 'slug'
): Promise<string> => {
  const originalSlug = slugify(baseText);
  let slug = originalSlug;
  let count = 1;

  // Simple sequential uniqueness check
  while (await model.exists({ [field]: slug })) {
    slug = `${originalSlug}-${count}`;
    count++;
  }

  return slug;
};

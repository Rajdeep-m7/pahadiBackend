export enum EApplicationEnvironment {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
}

export const responseMessage = {
  SUCCESS: 'The request has been suuccefful',
  SOMETHING_WENT_WRONG: 'Something went wrong',
  NOT_FOUND: (name: string) => `${name} not found`,
};

export const MAX_IMAGE_SIZE_MB = 2;
export const MAX_IMAGE_SIZE = MAX_IMAGE_SIZE_MB * 1024 * 1024; // 2MB in bytes


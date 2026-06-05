export interface UploadFileResult {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
  [key: string]: unknown;
}

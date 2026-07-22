export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MERCHANT_NAME: string;
  MERCHANT_ID: string;
  /** When non-empty, write actions require this bearer token. */
  PAYLA_API_KEY: string;
}

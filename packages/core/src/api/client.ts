import createClient, { type Middleware } from 'openapi-fetch';
import { log } from '../utils/log';
import type { paths } from './schema';
import type { components } from './schema';

type Options = {
  baseUrl: string;
  onRequest?: Middleware['onRequest'];
  onResponse?: Middleware['onResponse'];
  onError?: Middleware['onError'];
};

const defaultOnError: Middleware['onError'] = (onErrorOptions) => {
  log.error('request failed', onErrorOptions.error);
};

export const basicClient = (options: Options) => {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
  });

  const middlewares: Middleware = {
    onRequest: options.onRequest,
    onResponse: options.onResponse,
    onError: options.onError || defaultOnError,
  };

  client.use(middlewares);
  return client;
};

export type Endpoint = keyof paths;
export type Dto = components['schemas'];

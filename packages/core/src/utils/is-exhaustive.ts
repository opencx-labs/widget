import { log } from './log';
export function isExhaustive(value: never, funcName: string) {
  log.error(`missing case for ${value} in ${funcName}`);
}

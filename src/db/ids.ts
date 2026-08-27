import * as Crypto from 'expo-crypto';

/**
 * Row ids are UUIDs rather than autoincrementing integers so that two devices
 * writing offline can never mint the same id. This is the cheapest thing to get
 * right up front and the most painful to retrofit.
 */
export const newId = (): string => Crypto.randomUUID();

/** Every write stamps this; sync resolves conflicts by comparing them. */
export const now = (): number => Date.now();

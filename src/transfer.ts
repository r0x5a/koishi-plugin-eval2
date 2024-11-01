// https://github.com/koishijs/koishi-plugin-eval/blob/e46ddb638f750fa2555a63e93cd230f920494d20/packages/core/src/transfer.ts

import type { MessagePort, Worker } from 'node:worker_threads';

import { randomUUID } from 'node:crypto';
import Logger from 'reggol';

type Endpoint = MessagePort | Worker;

interface Message {
	id: string;
	type: 'apply';
	key?: string;
	args?: any[];
	value?: any;
}

const logger = new Logger('transfer');

export async function request(ep: Endpoint, payload: Partial<Message>) {
	const id = randomUUID();
	return new Promise<Message>((resolve) => {
		ep.on('message', function listener(data: string) {
			const message = JSON.parse(data);
			if (message.id !== id) return;
			ep.off('message', listener);
			resolve(message);
		});
		logger.debug('[request] %o', { id, ...payload });
		ep.postMessage(JSON.stringify({ id, ...payload }));
	});
}

function wrapFunction(ep: Endpoint, key: string) {
	return new Proxy(() => { }, {
		async apply(_target, _thisArg, args) {
			const message = await request(ep, { type: 'apply', key, args });
			return message.value;
		},
	});
}

export type Promisify<T> = T extends Promise<unknown> ? T : Promise<T>;
export type RemoteFunction<T> = T extends (...args: infer R) => infer S ? (...args: R) => Promisify<S> : never;
export type Remote<T> = { [P in keyof T]: RemoteFunction<T[P]> };

export function wrap<T>(ep: Endpoint) {
	return new Proxy({} as Remote<T>, {
		get(_target, key) {
			if (typeof key !== 'string') return;
			return wrapFunction(ep, key);
		},
	});
}

export function expose(ep: Endpoint, object: object) {
	ep.on('message', async (data: string) => {
		const payload = JSON.parse(data);
		logger.debug('[receive] %o', payload);
		const { type, key, id, args } = payload;
		if (type !== 'apply') return;
		const value = await object[key](...args);
		ep.postMessage(JSON.stringify({ id, value }));
	});
}

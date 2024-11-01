import type { Context } from 'koishi';

import { } from '@koishijs/plugin-server';
import { Service } from 'koishi';
import fs from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

import type { Config } from '.';
import type { WorkerHandle } from './worker';

import { wrap } from './transfer';

declare module 'koishi' {
	interface Context {
		['runner']: Runner;
	}
	interface Events {
	}
}

export enum State { closing, closed, opening, opened };

export default class Runner extends Service {
	declare config: Config;
	readonly logger = this.ctx.logger('runner');

	private worker: Worker;

	public state = State.closed;
	public remote: WorkerHandle;

	constructor(ctx: Context, config: Config) {
		super(ctx, 'runner');

		this.config = config;
	}

	async start() {
		this.logger.info('Setup runner');

		this.state = State.opening;
		this.worker = new Worker(`void require('${require.resolve('./worker')}').start();`, {
			eval: true,
			workerData: {},
			resourceLimits: this.config.resourceLimits,
		});
		this.remote = wrap(this.worker);
		if (this.config.bootstrap)
			await this.remote.eval(await fs.readFile(this.config.bootstrap, 'utf8'));

		this.state = State.opened;
	}

	// TODO: stop, restart, error handling for worker
}

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
	private preventRestart = false;
	private promise: Promise<void>;

	public state = State.closed;
	public remote: WorkerHandle;

	constructor(ctx: Context, config: Config) {
		super(ctx, 'runner');

		this.config = config;
	}

	async start() {
		this.state = State.opening;
		this.worker = new Worker(`void require('${require.resolve('./worker')}').start(${JSON.stringify(this.config.resourceLimits)});`, {
			eval: true,
			workerData: {},
			resourceLimits: this.config.resourceLimits,
		});
		this.remote = wrap(this.worker);

		await this.remote.start();
		if (this.config.bootstrap)
			await this.remote.eval(await fs.readFile(this.config.bootstrap, 'utf8'), 'init.js');

		this.logger.info('Worker started');
		this.state = State.opened;

		this.worker.on('exit', (code) => {
			this.state = State.closed;
			this.logger.debug('Worker exited with code', code);
			if (!this.preventRestart) this.promise = this.start();
		});
	}

	async restart() {
		this.state = State.closing;
		await this.worker?.terminate();
		await this.promise;
	}

	private beforeExit = () => {
		this.preventRestart = true;
	};

	stop = async () => {
		this.state = State.closing;
		this.beforeExit();
		process.off('beforeExit', this.beforeExit);
		await this.worker?.terminate();
	};

	// TODO: error handling for worker
}

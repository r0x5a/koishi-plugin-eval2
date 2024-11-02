import type { ResourceLimits } from 'node:worker_threads';
import type { DisposableFail, DisposableResult, QuickJSContext, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten';

import { formatWithOptions } from 'node:util';
import { parentPort } from 'node:worker_threads';
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten';

import { expose } from '../transfer';

let quickJS: QuickJSWASMModule;
let runtime: QuickJSRuntime;
let vm: QuickJSContext;

const isErr = <S, F>(x: DisposableResult<S, F>): x is DisposableFail<F> => 'error' in x;
export class WorkerHandle {
	async start() { // TODO
		return 'qwq';
	}

	async eval(code: string) {
		const deadline = Date.now() + 1000;
		vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));

		const result = vm.evalCode(code, 'index.js', { type: 'global' });
		let str: string;
		if (!isErr(result)) {
			str = formatWithOptions({ depth: 1 }, vm.dump(result.value));
			result.value.dispose();
		} else {
			const err: Error = vm.dump(result.error);
			str = `${err.name}: ${err.message}\n${err.stack}`;
			result.error.dispose();
		}
		return str;
	}
}

export async function start(limits: ResourceLimits) {
	quickJS = await getQuickJS();
	runtime = quickJS.newRuntime({ // TODO: Configurable resource limits
		// NOTE: This is not actually working, see: https://github.com/justjake/quickjs-emscripten/pull/207
		maxStackSizeBytes: limits.stackSizeMb * 1024 * 1024, // 16KiB
		memoryLimitBytes: limits.maxOldGenerationSizeMb * 1024 * 1024, // 16MiB
	});
	vm = runtime.newContext();

	expose(parentPort, new WorkerHandle());
}

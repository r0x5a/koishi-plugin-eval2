import type { Context } from 'koishi';
import type { ResourceLimits } from 'node:worker_threads';

import { } from '@koishijs/plugin-help';
import { h, Schema } from 'koishi';
import { inspect } from 'node:util';

import Runner from './runner';

export const name = 'eval2';

export interface Config {
	prefix?: string;
	authority?: number;
	bootstrap?: string;
	resourceLimits?: ResourceLimits;
	outputLimits?: {
		maxLines: number;
		maxChars: number;
	};
}

export const Config: Schema<Config> = Schema.object({
	prefix: Schema.string().description('快捷调用的前缀字符。').default('>'),
	bootstrap: Schema.path({
		filters: ['file', { name: '', extensions: ['.js', '.mjs'] }],
	}).description('启动脚本'),
	resourceLimits: Schema.object({
		maxYoungGenerationSizeMb: Schema.number(),
		maxOldGenerationSizeMb: Schema.number(),
		codeRangeSizeMb: Schema.number(),
		stackSizeMb: Schema.number(),
	}).description('资源限制'),
	outputLimits: Schema.object({
		maxLines: Schema.number().default(20).description('最多允许的输出行数。'),
		maxChars: Schema.number().default(1024).description('最多允许的输出字符数。'),
	}).description('输出限制'),
});

export async function apply(ctx: Context, config: Config) {
	ctx.plugin(Runner, config);

	const logger = ctx.logger('eval');

	ctx.inject(['runner'], (ctx) => {
		function escapeRegExp(s: string) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}

		const cmd = ctx.command('evaluate <code:rawtext>', '执行 JavaScript', { strictOptions: true }) // TODO: allow other elements (e.g. faces)
			.alias('eval')
			.action(async (_, payload?: string, ...rest) => {
				if (rest.length) {
					// Workaround for https://github.com/koishijs/koishi/issues/1473
					// This won't always work as expected, but it's better than nothing.
					// bug input: > -1+'          '.length // outputs 0, but should be 9
					payload = [payload, ...rest].join(' ');
				}
				if (!payload) return '请输入要执行的代码。';
				try {
					let content = await ctx.runner.remote.eval(payload, 'index.js');
					if (content) {
						content = content
							.split('\n')
							.slice(0, config.outputLimits.maxLines)
							.join('\n')
							.slice(0, config.outputLimits.maxChars);
					}

					// TODO: Add configurable allowed element types, filter for children, etc.
					for (const el of h.parse(content)) {
						if (el.type !== 'text' && el.type !== 'face')
							return `输出包含不支持的元素：${JSON.stringify(el.type)}。`;
						if (el.children.length)
							return `输出包含不支持的内容："children"。`;
					}
					return content;
				} catch (e) {
					logger.warn(e);
				}
			});

		if (config.prefix) {
			// TODO: Change to ctx.on('message', ...)
			cmd.shortcut(new RegExp(`^${escapeRegExp(h.escape(config.prefix))} (.+)$`, 'm'), { args: ['$1'] });
		}

		ctx.command('evaluate.restart', '重启子线程', { hidden: true, authority: 5 })
			.alias('evaluate.r')
			.action(async () => {
				await ctx.runner.restart();
				return '子线程已重启。';
			});
	});
}

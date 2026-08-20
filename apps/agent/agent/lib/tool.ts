import type { ToolContext } from "eve/tools";
import { defineTool as eveDefineTool, type ToolDefinition } from "eve/tools";
import { withOrganizationScopeAsync } from "./tenant";

export function defineTool<TInput, TOutput>(
	definition: ToolDefinition<TInput, TOutput>,
) {
	const execute = definition.execute;
	if (!execute) return eveDefineTool(definition);

	return eveDefineTool({
		...definition,
		async execute(input, ctx: ToolContext) {
			return await withOrganizationScopeAsync(ctx, async () => {
				const result = execute(input, ctx);
				return result instanceof Promise ? await result : result;
			});
		},
	});
}

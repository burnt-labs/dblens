import { executePg } from "./execute_pg";
import { getAiSuggestion } from "./get_ai_suggestion";
import { isAiAvailable } from "./is_ai_available";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		const handleCors = (response: Response) => {
			response.headers.set("Access-Control-Allow-Origin", "*");
			response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
			response.headers.set("Access-Control-Allow-Headers", "Content-Type");
			return response;
		};

		if (request.method === "OPTIONS") {
			return handleCors(new Response(null, { status: 204 }));
		}

		let response;
		switch (pathname) {
			case "/api/execute_pg":
				response = await executePg(request, env, ctx);
				break;
			case "/api/get_ai_suggestion":
				response = await getAiSuggestion(request, env, ctx);
				break;
			case "/api/is_ai_available":
				response = await isAiAvailable(request, env, ctx);
				break;
			default:
				response = new Response("Not Found", { status: 404 });
		}
		return handleCors(response);
	},
} satisfies ExportedHandler<Env>;

export const isAiAvailable = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  const status = env.OPENAI_API_KEY !== undefined ? "AVAILABLE" : "UNAVAILABLE";
  return new Response(
    JSON.stringify({ status }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

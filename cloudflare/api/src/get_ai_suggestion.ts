import OpenAI from "openai";

export interface SuggestionType {
  query: string;
  reason: string;
}

// Remove triple backticks if they are part of the input
function parseJsonSafely(jsonString: string): SuggestionType | null {
  const cleanedJsonString = jsonString.replace(
    /^```json\s*([\s\S]*)```$/,
    "$1"
  );
  try {
    const parsed: SuggestionType = JSON.parse(cleanedJsonString);
    return parsed;
  } catch (error) {
    console.error("Failed to parse JSON string:", error);
    return null;
  }
}

export const getAiSuggestion = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  const { systemInstructions, query, error } = await request.json() as { systemInstructions: any, query: string, error: string };
  if (!systemInstructions || !query || !error) {
    const missingParams = [];
    if (!systemInstructions) missingParams.push("systemInstructions");
    if (!query) missingParams.push("query");
    if (!error) missingParams.push("error");
    return new Response(
      JSON.stringify({
        message: `Missing required parameters: ${missingParams.join(", ")}`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: JSON.stringify(systemInstructions),
        },
        {
          role: "user",
          content: JSON.stringify({ query, error }),
        },
      ],
      temperature: 1,
      max_tokens: 1024,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    try {
      if (
        response &&
        response.choices &&
        response.choices[0] &&
        response.choices[0].message &&
        response.choices[0].message.content
      ) {
        console.log("AI response:", response.choices[0].message.content);
        const result = parseJsonSafely(response.choices[0].message.content);
        if (result === null) throw new Error("Failed to parse JSON");
        else return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error("No response from AI");
    } catch (error) {
      console.error("Error parsing response:", error);
      return new Response(
        JSON.stringify({
          message: "Error parsing response",
          error,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error("Error executing queries:", error);
    return new Response(
      JSON.stringify({ message: "Error executing queries", error: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

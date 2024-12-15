import { Client } from "pg";

type QueryResult = {
  query: string;
  status: string;
  rows: any[];
  description?: any;
  duration: number;
};

type ResponseData = {
  message: string;
  data?: QueryResult[];
  error?: string;
};

const getConnection = async (connectionString: string): Promise<Client> => {
  console.log("Establishing new PostgreSQL connection...");
  let client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");
  } catch (initialError) {
    console.log("Attempting connection with sslmode=require...");
    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log("Connected to PostgreSQL database with SSL.");
    } catch (sslError) {
      console.error("SSL connection error:", sslError);
      if (sslError instanceof Error) {
        throw new Error(sslError.message);
      } else {
        throw new Error("Unknown SSL connection error");
      }
    }
  }

  client.on("error", async (err: Error) => {
    console.error(`PostgreSQL client error: ${err.message}`);
    await client.end();
  });

  return client;
}

const validateQuery = async (query: string): Promise<string> => {
  let queryToExecute = query.trim();

  if (!query.trim().toUpperCase().startsWith("SELECT")) {
    throw new Error("Only SELECT queries are allowed.");
  }

  // Add limit if not specified
  if (!/LIMIT\s+\d+/i.test(query)) {
    return queryToExecute.replace(/;?$/, " LIMIT 100;");
  } else {
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch && parseInt(limitMatch[1], 10) > 500) {
      throw new Error("Query limit cannot exceed 500.");
    }
  }
  return queryToExecute;
}

const executeQuery = async (client: Client, query: string): Promise<QueryResult> => {
  try {
    const queryToExecute = await validateQuery(query);
    const startTime = process.hrtime();
    const result = await client.query(queryToExecute);
    const duration = process.hrtime(startTime);
    const rows = Array.isArray(result)
      ? result.reduce((acc, val) => acc.concat(val.rows), [])
      : result.rows;

    return {
      query: queryToExecute,
      status: "SUCCESS",
      description: result.command,
      rows,
      duration: duration[0] * 1000 + duration[1] / 1e6,
    };
  } catch (error) {
    console.error("Error executing query:", error);
    return {
      query: query.trim(),
      status: "ERROR",
      description: (error instanceof Error) ? error.message : String(error),
      rows: [],
      duration: 0,
    };
  }
}

export const executePg = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  try {

    const connectionString = env.HYPERDRIVE.connectionString;
    const client = await getConnection(connectionString);
    ctx.waitUntil(Promise.resolve(client));

    const { queries } = (await request.json()) as { queries: string[] };
    const results: QueryResult[] = await Promise.all(
      queries.map(async (query) => executeQuery(client, query))
    );
    ctx.waitUntil(Promise.resolve(results));

    return Response.json(
      {
        message:
          "Queries execution completed, please check individual query status from the results",
        data: results,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error executing queries:", error);
    return Response.json(
      { message: "Error executing queries", error: error?.message },
      { status: 500 }
    );
  }
};

// Utility function to check for connection errors
function isConnectionError(error: any): boolean {
  return (
    error.code === "ECONNRESET" ||
    error.code === "ENOTFOUND" ||
    error.code === "EHOSTUNREACH" ||
    error.message.includes("Connection terminated")
  );
}

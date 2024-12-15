import { Client } from "pg";

type QueryResult = {
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

interface ClientMap {
  [key: string]: typeof Client;
}
let cachedClient = {} as ClientMap;

export async function getConnection({
  noCache = false,
  connectionString,
}: {
  noCache?: boolean;
  connectionString?: string;
}): Promise<typeof Client> {
  const cacheKey = "123456789"; // Generate cache key from connection string

  if (cachedClient[cacheKey] && !noCache) {
    console.log("Using cached PostgreSQL connection.");
    return cachedClient[cacheKey] as typeof Client;
  }

  console.log("Establishing new PostgreSQL connection...");
  let client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");
  } catch (initialError) {
    console.log("Attempting connection with sslmode=require...");
    // Try with sslmode=require
    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log("Connected to PostgreSQL database with SSL.");
    } catch (sslError: any) {
      console.error("SSL connection error:", sslError);
      throw new Error(sslError.message);
    }
  }

  // Cache the client connection
  cachedClient[cacheKey] = client;

  // Add error handling for the client
  client.on("error", async (err: Error) => {
    console.error("PostgreSQL client error:", err.message);
    console.log("Reconnecting to PostgreSQL...");
    delete cachedClient[cacheKey]; // Remove the faulty client from cache
    cachedClient[cacheKey] = await getConnection({ connectionString }); // Reconnect
  });

  return client;
}

async function executeQueries(
  client: typeof Client,
  queries: string[]
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  for (const query of queries) {
    const startTime = process.hrtime();
    try {
      const result = await client.query(query);
      const duration = process.hrtime(startTime);

      if (Array.isArray(result)) {
        const rows = result.reduce((acc, val) => acc.concat(val.rows), []);
        results.push({
          status: "SUCCESS",
          rows,
          duration: duration[0] * 1000 + duration[1] / 1e6, // Convert duration to milliseconds
        });
      } else {
        results.push({
          status: "SUCCESS",
          rows: result.rows,
          duration: duration[0] * 1000 + duration[1] / 1e6, // Convert duration to milliseconds
        });
      }
    } catch (error) {
      console.error("Error executing query:", error);

      if (isConnectionError(error)) {
        console.log("Connection error detected. Retrying query...");
        try {
          // Reconnect the client
          client = await getConnection({});
          const result = await client.query(query);
          const duration = process.hrtime(startTime);

          if (Array.isArray(result)) {
            const rows = result.reduce((acc, val) => acc.concat(val.rows), []);
            results.push({
              status: "SUCCESS",
              rows,
              duration: duration[0] * 1000 + duration[1] / 1e6, // Convert duration to milliseconds
            });
          } else {
            results.push({
              status: "SUCCESS",
              rows: result.rows,
              duration: duration[0] * 1000 + duration[1] / 1e6, // Convert duration to milliseconds
            });
          }
        } catch (retryError) {
          console.error("Error executing query on retry:", retryError);
          results.push({
            status: "ERROR",
            description: retryError,
            rows: [],
            duration: 0,
          });
        }
      } else {
        results.push({
          status: "ERROR",
          description: error,
          rows: [],
          duration: 0,
        });
      }
    }
  }

  return results;
}

// Utility function to check for connection errors
function isConnectionError(error: any): boolean {
  // Implement logic to check if the error is a connection error
  // This could be based on error codes, messages, or other properties
  // Example:
  // return error.code === 'ECONNRESET' || error.code === 'ENOTFOUND';
  return (
    error.code === "ECONNRESET" ||
    error.code === "ENOTFOUND" ||
    error.code === "EHOSTUNREACH" ||
    error.message.includes("Connection terminated")
  );
}

export const executePg = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  const { queries } = await request.json() as { queries: string[] };
  const connectionString = env.HYPERDRIVE.connectionString;

  const client = await getConnection({ connectionString });

  const results = await executeQueries(client, queries);
  try {
    return Response.json({ message: "Queries execution completed, please check individual query status from the results", data: results }, { status: 200 });
  } catch (error: any) {
    console.error("Error executing queries:", error);
    return Response.json({ message: "Error executing queries", error: error?.message }, { status: 500 });
  }
};

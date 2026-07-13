import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

const mask = (val: string | undefined) => {
  if (!val) return "NOT SET";
  if (val.length <= 8) return "*".repeat(val.length);
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const envVars = {
    SHOPIFY_API_KEY: mask(process.env.SHOPIFY_API_KEY),
    SHOPIFY_API_SECRET: mask(process.env.SHOPIFY_API_SECRET),
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "NOT SET",
    SCOPES: process.env.SCOPES || "NOT SET",
    DATABASE_URL: mask(process.env.DATABASE_URL),
    DIRECT_URL: mask(process.env.DIRECT_URL),
  };

  const results: any = {
    envVars,
    dbConnection: "Checking...",
    tables: {},
    error: null,
  };

  try {
    // 1. Check direct query
    const dbCheck = await db.$queryRaw`SELECT 1 as connected`;
    results.dbConnection = `Connected: ${JSON.stringify(dbCheck)}`;

    // 2. Check each table count and contents
    try {
      results.tables.Session = await db.session.count();
      results.sessionsList = await db.session.findMany({
        where: {
          NOT: {
            id: {
              startsWith: "db_log_"
            }
          }
        }
      });
    } catch (e: any) {
      results.tables.Session = `Error: ${e.message}`;
    }

    try {
      results.tables.AppSettings = await db.appSettings.count();
    } catch (e: any) {
      results.tables.AppSettings = `Error: ${e.message}`;
    }

    try {
      results.tables.ReturnRequest = await db.returnRequest.count();
    } catch (e: any) {
      results.tables.ReturnRequest = `Error: ${e.message}`;
    }

    try {
      results.tables.ReturnItem = await db.returnItem.count();
    } catch (e: any) {
      results.tables.ReturnItem = `Error: ${e.message}`;
    }

  } catch (err: any) {
    results.dbConnection = "Failed to connect";
    results.error = {
      message: err.message,
      stack: err.stack,
    };
  }

  return json(results);
};

export default function DebugDb() {
  return null;
}

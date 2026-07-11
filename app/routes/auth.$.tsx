import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";

import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await shopify.authenticate.admin(request);
    return null;
  } catch (error: any) {
    if (error instanceof Response) {
      throw error;
    }
    try {
      await db.session.upsert({
        where: { id: "last_auth_error" },
        update: {
          shop: error.name || "Error",
          state: error.message || "No message",
          accessToken: error.stack || "No stack",
          isOnline: false,
        },
        create: {
          id: "last_auth_error",
          shop: error.name || "Error",
          state: error.message || "No message",
          accessToken: error.stack || "No stack",
          isOnline: false,
        },
      });
    } catch (dbErr) {
      console.error("Failed to log error to database:", dbErr);
    }
    throw error;
  }
};

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await shopify.authenticate.admin(request);
    return json({ status: "ok" });
  } catch (error: any) {
    // Explicitly print the full exception stack trace to Vercel runtime logs
    console.error("CRITICAL RUNTIME EXCEPTION IN /app LOADER:", error);
    if (error && error.stack) {
      console.error(error.stack);
    }
    // Re-throw so Remix propagates the error response
    throw error;
  }
};

export default function Index() {
  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Embedded Shopify App is working</h1>
    </div>
  );
}

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify, { dbLog } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await dbLog("APP_INDEX_LOADER_START", request.url);
  try {
    const context = await shopify.authenticate.admin(request);
    await dbLog("APP_INDEX_LOADER_SUCCESS", `shop: ${context?.session?.shop}`);
    return json({ status: "ok" });
  } catch (error: any) {
    if (error instanceof Response) {
      await dbLog(
        "APP_INDEX_LOADER_REDIRECT",
        `status: ${error.status}, location: ${error.headers.get("location")}`
      );
    } else {
      await dbLog(
        "APP_INDEX_LOADER_ERROR",
        `${error.message}\n${error.stack}`
      );
    }
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

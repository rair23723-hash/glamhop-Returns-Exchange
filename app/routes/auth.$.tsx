import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify, { dbLog } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await dbLog("AUTH_SPLAT_LOADER_START", request.url);
  try {
    const context = await shopify.authenticate.admin(request);
    await dbLog("AUTH_SPLAT_LOADER_SUCCESS", `shop: ${context?.session?.shop}`);
    return null;
  } catch (error: any) {
    if (error instanceof Response) {
      await dbLog(
        "AUTH_SPLAT_LOADER_REDIRECT",
        `status: ${error.status}, location: ${error.headers.get("location")}`
      );
    } else {
      await dbLog(
        "AUTH_SPLAT_LOADER_ERROR",
        `${error.message}\n${error.stack}`
      );
    }
    throw error;
  }
};

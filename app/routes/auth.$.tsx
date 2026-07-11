import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("=== [AUTH_SPLAT_LOADER] callback request received ===", request.url);
  try {
    const context = await shopify.authenticate.admin(request);
    console.log("=== [AUTH_SPLAT_LOADER] authenticate.admin context ===", {
      shop: context?.session?.shop,
      accessTokenExists: !!context?.session?.accessToken,
    });
    return null;
  } catch (error: any) {
    if (error instanceof Response) {
      console.log("=== [AUTH_SPLAT_LOADER] authenticate.admin redirected/responded ===", {
        status: error.status,
        location: error.headers.get("location"),
      });
    } else {
      console.error("=== [AUTH_SPLAT_LOADER] authenticate.admin CRITICAL ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
    }
    throw error;
  }
};

import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await shopify.authenticate.admin(request);
  return null;
};

import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { boundary } from "@shopify/shopify-app-remix/server";
import shopify from "../shopify.server";
import polarisTranslations from "@shopify/polaris/locales/en.json";

import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await shopify.authenticate.admin(request);
    return json({
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
  } catch (error: any) {
    if (error instanceof Response) {
      throw error;
    }
    try {
      await db.session.upsert({
        where: { id: "last_loader_error" },
        update: {
          shop: error.name || "Error",
          state: error.message || "No message",
          accessToken: error.stack || "No stack",
          isOnline: false,
        },
        create: {
          id: "last_loader_error",
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

export default function AppLayout() {
  useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <ui-nav-menu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        <Link to="/app/returns">Return Requests</Link>
        <Link to="/app/exchanges">Exchange Requests</Link>
        <Link to="/app/customers">Customers</Link>
        <Link to="/app/settings">Settings</Link>
      </ui-nav-menu>
      <Outlet />
    </PolarisAppProvider>
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return {
    "Content-Security-Policy": "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com;",
  };
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

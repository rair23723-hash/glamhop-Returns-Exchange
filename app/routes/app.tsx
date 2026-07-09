import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/styles.css";
import { Boundary } from "@shopify/shopify-app-remix/react";
import shopify from "../shopify.server";
import polarisTranslations from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await shopify.authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
  });
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
  return <Boundary />;
}

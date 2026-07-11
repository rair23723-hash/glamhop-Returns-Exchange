import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { AppProvider as RemixAppProvider } from "@shopify/shopify-app-remix/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import shopify from "../shopify.server";
import polarisTranslations from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await shopify.authenticate.admin(request);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    polarisTranslations,
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function AppLayout() {
  const { apiKey, polarisTranslations: translations } = useLoaderData<typeof loader>();

  return (
    <RemixAppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={translations}>
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
    </RemixAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

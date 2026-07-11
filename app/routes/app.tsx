import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
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

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return boundary.headers({ loaderHeaders });
};

export default function AppLayout() {
  const { polarisTranslations: translations } = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={translations}>
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
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

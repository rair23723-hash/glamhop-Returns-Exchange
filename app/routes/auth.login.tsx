import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  AppProvider as PolarisAppProvider,
  Page,
  BlockStack,
  Text,
  Spinner,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "glamhop.myshopify.com";

  // Force shop parameter to GlamHop store domain if missing
  if (!url.searchParams.has("shop")) {
    url.searchParams.set("shop", shop);
    return redirect(url.toString());
  }

  return await shopify.login(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return await shopify.login(request);
};

export default function Login() {
  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Page>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
          <BlockStack gap="400" align="center">
            <Spinner size="large" />
            <Text as="p" tone="subdued">Authenticating session, please wait...</Text>
          </BlockStack>
        </div>
      </Page>
    </PolarisAppProvider>
  );
}

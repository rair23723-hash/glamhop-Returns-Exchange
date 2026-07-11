import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await shopify.authenticate.admin(request);
  return json({ ok: true });
};

export default function Index() {
  useLoaderData<typeof loader>();
  return (
    <Page title="GlamHop Returns & Exchange">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Embedded Shopify App is working.
          </Text>
          <Text as="p" tone="subdued">
            Authentication and configuration are correct.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

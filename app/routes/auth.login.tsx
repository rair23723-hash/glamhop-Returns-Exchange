import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
  Box,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const errors = await shopify.login(request);
    return json({ errors });
  } catch (error: any) {
    console.error("CRITICAL RUNTIME EXCEPTION IN /auth/login LOADER:", error);
    if (error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const errors = await shopify.login(request);
    return json({ errors });
  } catch (error: any) {
    console.error("CRITICAL RUNTIME EXCEPTION IN /auth/login ACTION:", error);
    if (error && error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
};

export default function Login() {
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");

  return (
    <PolarisAppProvider i18n={polarisTranslations}>
      <Page>
        <Box paddingBlockStart="160" paddingBlockEnd="160">
          <Card>
            <Form method="post">
              <FormLayout>
                <Text as="h1" variant="headingMd">
                  Log in to GlamHop Returns & Exchange
                </Text>
                <TextField
                  type="text"
                  name="shop"
                  label="Shop domain"
                  value={shop}
                  onChange={setShop}
                  autoComplete="on"
                  placeholder="example.myshopify.com"
                  error={actionData?.errors?.shop}
                />
                <Button submit variant="primary">
                  Log in
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Box>
      </Page>
    </PolarisAppProvider>
  );
}

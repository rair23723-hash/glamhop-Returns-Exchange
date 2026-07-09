import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import shopify from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  let settings = await db.appSettings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await db.appSettings.create({
      data: {
        shop,
        returnWindowDays: 30,
        exchangeWindowDays: 30,
        returnFee: 0.0,
        exchangeFee: 0.0,
        eligibleCategories: JSON.stringify(["Apparel", "Footwear"]),
        nonReturnableProducts: JSON.stringify([]),
        saleItemsEligible: false,
        imageRequired: true,
        maxImages: 5,
        allowedReasons: JSON.stringify([
          "Wrong Size",
          "Wrong Product",
          "Damaged Product",
          "Defective Product",
          "Quality Issue",
          "Product Not As Expected",
          "Changed Mind",
          "Other",
        ]),
      },
    });
  }

  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const returnWindowDays = parseInt(formData.get("returnWindowDays") as string, 10) || 30;
  const exchangeWindowDays = parseInt(formData.get("exchangeWindowDays") as string, 10) || 30;
  const returnFee = parseFloat(formData.get("returnFee") as string) || 0.0;
  const exchangeFee = parseFloat(formData.get("exchangeFee") as string) || 0.0;

  const saleItemsEligible = formData.get("saleItemsEligible") === "true";
  const imageRequired = formData.get("imageRequired") === "true";
  const maxImages = parseInt(formData.get("maxImages") as string, 10) || 5;

  // Comma-separated parsers
  const eligibleCatsRaw = formData.get("eligibleCategories") as string;
  const eligibleCategories = JSON.stringify(
    eligibleCatsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  );

  const nonReturnableProdsRaw = formData.get("nonReturnableProducts") as string;
  const nonReturnableProducts = JSON.stringify(
    nonReturnableProdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  );

  const allowedReasonsRaw = formData.get("allowedReasons") as string;
  const allowedReasons = JSON.stringify(
    allowedReasonsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  );

  await db.appSettings.upsert({
    where: { shop },
    create: {
      shop,
      returnWindowDays,
      exchangeWindowDays,
      returnFee,
      exchangeFee,
      eligibleCategories,
      nonReturnableProducts,
      saleItemsEligible,
      imageRequired,
      maxImages,
      allowedReasons,
    },
    update: {
      returnWindowDays,
      exchangeWindowDays,
      returnFee,
      exchangeFee,
      eligibleCategories,
      nonReturnableProducts,
      saleItemsEligible,
      imageRequired,
      maxImages,
      allowedReasons,
    },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [returnWindowDays, setReturnWindowDays] = useState(settings.returnWindowDays.toString());
  const [exchangeWindowDays, setExchangeWindowDays] = useState(settings.exchangeWindowDays.toString());
  const [returnFee, setReturnFee] = useState(settings.returnFee.toString());
  const [exchangeFee, setExchangeFee] = useState(settings.exchangeFee.toString());

  const [saleItemsEligible, setSaleItemsEligible] = useState(settings.saleItemsEligible);
  const [imageRequired, setImageRequired] = useState(settings.imageRequired);
  const [maxImages, setMaxImages] = useState(settings.maxImages.toString());

  // JSON arrays represented as comma-separated lists for human editing
  const [eligibleCategories, setEligibleCategories] = useState(
    JSON.parse(settings.eligibleCategories).join(", ")
  );
  const [nonReturnableProducts, setNonReturnableProducts] = useState(
    JSON.parse(settings.nonReturnableProducts).join(", ")
  );
  const [allowedReasons, setAllowedReasons] = useState(
    JSON.parse(settings.allowedReasons).join(", ")
  );

  const [showSavedBanner, setShowSavedBanner] = useState(false);

  useEffect(() => {
    if (navigation.state === "loading" && navigation.formMethod === "POST") {
      setShowSavedBanner(true);
      const timer = setTimeout(() => setShowSavedBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [navigation.state, navigation.formMethod]);

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {showSavedBanner && (
              <Banner
                title="Settings saved successfully"
                tone="success"
                onDismiss={() => setShowSavedBanner(false)}
              />
            )}
            <Card>
              <Form method="post">
                <FormLayout>
                  <Text as="h2" variant="headingMd">
                    Policy Windows & Fees
                  </Text>
                  <FormLayout.Group condensed>
                    <TextField
                      type="number"
                      name="returnWindowDays"
                      label="Return Window (Days)"
                      value={returnWindowDays}
                      onChange={setReturnWindowDays}
                      autoComplete="off"
                    />
                    <TextField
                      type="number"
                      name="exchangeWindowDays"
                      label="Exchange Window (Days)"
                      value={exchangeWindowDays}
                      onChange={setExchangeWindowDays}
                      autoComplete="off"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group condensed>
                    <TextField
                      type="number"
                      name="returnFee"
                      label="Return Processing Fee"
                      value={returnFee}
                      onChange={setReturnFee}
                      prefix="$"
                      autoComplete="off"
                    />
                    <TextField
                      type="number"
                      name="exchangeFee"
                      label="Exchange Processing Fee"
                      value={exchangeFee}
                      onChange={setExchangeFee}
                      prefix="$"
                      autoComplete="off"
                    />
                  </FormLayout.Group>

                  <Divider />

                  <Text as="h2" variant="headingMd">
                    Eligibility Constraints
                  </Text>

                  <Checkbox
                    label="Allow returns/exchanges on Sale Items"
                    checked={saleItemsEligible}
                    onChange={setSaleItemsEligible}
                  />
                  <input
                    type="hidden"
                    name="saleItemsEligible"
                    value={saleItemsEligible ? "true" : "false"}
                  />

                  <TextField
                    type="text"
                    name="eligibleCategories"
                    label="Eligible Product Categories (Comma-separated)"
                    value={eligibleCategories}
                    onChange={setEligibleCategories}
                    placeholder="e.g. Apparel, Footwear, Swimwear"
                    helpText="If empty, all product categories will be eligible by default."
                    autoComplete="off"
                  />

                  <TextField
                    type="text"
                    name="nonReturnableProducts"
                    label="Non-Returnable Product GIDs (Comma-separated)"
                    value={nonReturnableProducts}
                    onChange={setNonReturnableProducts}
                    placeholder="e.g. gid://shopify/Product/1234, gid://shopify/Product/5678"
                    helpText="Specific products that cannot be returned or exchanged under any policy."
                    autoComplete="off"
                  />

                  <Divider />

                  <Text as="h2" variant="headingMd">
                    Customer Experience & Uploads
                  </Text>

                  <Checkbox
                    label="Require customer to upload image proofs"
                    checked={imageRequired}
                    onChange={setImageRequired}
                  />
                  <input
                    type="hidden"
                    name="imageRequired"
                    value={imageRequired ? "true" : "false"}
                  />

                  <TextField
                    type="number"
                    name="maxImages"
                    label="Maximum allowed uploads"
                    value={maxImages}
                    onChange={setMaxImages}
                    autoComplete="off"
                  />

                  <TextField
                    type="text"
                    name="allowedReasons"
                    label="Dropdown Reasons list (Comma-separated)"
                    value={allowedReasons}
                    onChange={setAllowedReasons}
                    helpText="Custom dropdown options presented to customers in storefront portal."
                    autoComplete="off"
                  />

                  <Button submit variant="primary" loading={isSaving}>
                    Save Settings
                  </Button>
                </FormLayout>
              </Form>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

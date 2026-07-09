import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const exchanges = await db.returnRequest.findMany({
    where: {
      shop,
      type: "EXCHANGE",
    },
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ exchanges });
};

export default function ExchangesPage() {
  const { exchanges } = useLoaderData<typeof loader>();

  const resourceName = {
    singular: "exchange request",
    plural: "exchange requests",
  };

  const rowMarkup = exchanges.map(
    (
      { id, requestId, orderNumber, customerName, customerEmail, status, createdAt, items },
      index
    ) => {
      const productSummary = items.map((i) => i.productTitle).join(", ");
      const swapSummary = items
        .map((i) => `${i.variantTitle} → ${i.requestedSize || "New Size"}`)
        .join(", ");
      const reasonSummary = items.map((i) => i.reason).join(", ");

      return (
        <IndexTable.Row id={id} key={id} position={index}>
          <IndexTable.Cell>
            <Link
              to={`/app/requests/${id}`}
              style={{
                textDecoration: "none",
                fontWeight: 600,
                color: "#000000",
              }}
            >
              {requestId}
            </Link>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">
              #{orderNumber}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{customerName || "N/A"}</IndexTable.Cell>
          <IndexTable.Cell>{customerEmail || "N/A"}</IndexTable.Cell>
          <IndexTable.Cell>{productSummary}</IndexTable.Cell>
          <IndexTable.Cell>{swapSummary}</IndexTable.Cell>
          <IndexTable.Cell>{reasonSummary}</IndexTable.Cell>
          <IndexTable.Cell>
            {new Date(createdAt).toLocaleDateString()}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge
              tone={
                status === "PENDING"
                  ? "attention"
                  : status === "COMPLETED"
                    ? "success"
                    : status === "REJECTED"
                      ? "critical"
                      : "info"
              }
            >
              {status}
            </Badge>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Page title="Exchange Requests">
      <Layout>
        <Layout.Section>
          {exchanges.length === 0 ? (
            <Card>
              <EmptyState
                heading="No exchange requests found"
                action={{ content: "View all requests", url: "/app/requests" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Exchange requests submitted by customers will show up here.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                resourceName={resourceName}
                itemCount={exchanges.length}
                headings={[
                  { title: "Request ID" },
                  { title: "Order" },
                  { title: "Customer" },
                  { title: "Email" },
                  { title: "Product" },
                  { title: "Swap Detail" },
                  { title: "Reason" },
                  { title: "Submitted Date" },
                  { title: "Status" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

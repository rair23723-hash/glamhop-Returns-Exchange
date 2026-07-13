import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Grid,
  Text,
  Badge,
  IndexTable,
  EmptyState,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import db from "../db.server";

// Loader: Authenticates the admin and computes the 8 KPI analytics widgets
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  // 1. Calculate KPI Metrics
  const total = await db.returnRequest.count({ where: { shop } });
  const pending = await db.returnRequest.count({ where: { shop, status: "PENDING" } });
  const approved = await db.returnRequest.count({ where: { shop, status: "APPROVED" } });
  const rejected = await db.returnRequest.count({ where: { shop, status: "REJECTED" } });
  const refunded = await db.returnRequest.count({
    where: { shop, type: "RETURN", status: "COMPLETED" },
  });
  const exchanged = await db.returnRequest.count({
    where: { shop, type: "EXCHANGE", status: "COMPLETED" },
  });

  // Today's returns (since midnight of current day)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayReturns = await db.returnRequest.count({
    where: {
      shop,
      createdAt: { gte: startOfToday },
    },
  });

  // Monthly returns (since start of current calendar month)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyReturns = await db.returnRequest.count({
    where: {
      shop,
      createdAt: { gte: startOfMonth },
    },
  });

  // 2. Retrieve recent requests
  const recentRequests = await db.returnRequest.findMany({
    where: { shop },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return json({
    kpis: {
      total,
      pending,
      approved,
      rejected,
      refunded,
      exchanged,
      todayReturns,
      monthlyReturns,
    },
    recentRequests,
  });
};

export default function Index() {
  const { kpis, recentRequests } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const resourceName = {
    singular: "return request",
    plural: "return requests",
  };

  const rowMarkup = recentRequests.map(
    (
      { id, requestId, orderNumber, customerName, customerEmail, status, type, createdAt, items },
      index
    ) => {
      const productSummary = items.map((i) => i.productTitle).join(", ");
      const reasonSummary = items.map((i) => i.reason).join(", ");

      return (
        <IndexTable.Row
          id={id}
          key={id}
          position={index}
          onClick={() => navigate(`/app/requests/${id}`)}
          style={{ cursor: "pointer" }}
        >
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
          <IndexTable.Cell>
            <Badge tone={type === "RETURN" ? "info" : "success"}>{type}</Badge>
          </IndexTable.Cell>
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
    <Page title="Returns & Exchange Dashboard">
      <BlockStack gap="500">
        {/* KPI Grid Section */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">TOTAL RETURNS</Text>
                <Text variant="headingXl" as="p">{kpis.total}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">PENDING REVIEW</Text>
                <Text variant="headingXl" as="p" tone="caution">{kpis.pending}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">APPROVED</Text>
                <Text variant="headingXl" as="p">{kpis.approved}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">REJECTED</Text>
                <Text variant="headingXl" as="p" tone="critical">{kpis.rejected}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">REFUNDED</Text>
                <Text variant="headingXl" as="p">{kpis.refunded}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">EXCHANGED</Text>
                <Text variant="headingXl" as="p">{kpis.exchanged}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">TODAY'S REQUESTS</Text>
                <Text variant="headingXl" as="p" tone="success">{kpis.todayReturns}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
            <Card>
              <BlockStack gap="100">
                <Text variant="headingXs" as="h3" tone="subdued">THIS MONTH</Text>
                <Text variant="headingXl" as="p" tone="success">{kpis.monthlyReturns}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Requests Table Activity */}
        <Layout>
          <Layout.Section>
            <Card padding="400">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Recent Return Activity</Text>
                
                {recentRequests.length === 0 ? (
                  <EmptyState
                    heading="No requests received yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Submitted return and exchange requests will show up in real-time here.</p>
                  </EmptyState>
                ) : (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={recentRequests.length}
                    headings={[
                      { title: "Request ID" },
                      { title: "Order" },
                      { title: "Customer" },
                      { title: "Email" },
                      { title: "Product" },
                      { title: "Type" },
                      { title: "Reason" },
                      { title: "Date" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {rowMarkup}
                  </IndexTable>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

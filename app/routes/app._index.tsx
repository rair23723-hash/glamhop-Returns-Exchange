import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Grid,
  BlockStack,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import shopify from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch distinct metric card counters
  const pendingReturns = await db.returnRequest.count({
    where: { shop, status: "PENDING", type: "RETURN" },
  });

  const pendingExchanges = await db.returnRequest.count({
    where: { shop, status: "PENDING", type: "EXCHANGE" },
  });

  const approved = await db.returnRequest.count({
    where: { shop, status: "APPROVED" },
  });

  const rejected = await db.returnRequest.count({
    where: { shop, status: "REJECTED" },
  });

  const completed = await db.returnRequest.count({
    where: { shop, status: "COMPLETED" },
  });

  // 2. Recent requests activity
  const recentRequests = await db.returnRequest.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return json({
    pendingReturns,
    pendingExchanges,
    approved,
    rejected,
    completed,
    recentRequests,
  });
};

export default function Dashboard() {
  const {
    pendingReturns,
    pendingExchanges,
    approved,
    rejected,
    completed,
    recentRequests,
  } = useLoaderData<typeof loader>();

  return (
    <Page title="Dashboard">
      <Layout>
        {/* Metric Cards Grid */}
        <Layout.Section>
          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Pending Returns
                  </Text>
                  <Text as="p" variant="headingLg" tone="caution">
                    {pendingReturns}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Pending Exchanges
                  </Text>
                  <Text as="p" variant="headingLg" tone="caution">
                    {pendingExchanges}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Approved
                  </Text>
                  <Text as="p" variant="headingLg" tone="info">
                    {approved}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Rejected
                  </Text>
                  <Text as="p" variant="headingLg" tone="critical">
                    {rejected}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 2, lg: 2 }}>
              <Card>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingSm">
                    Completed
                  </Text>
                  <Text as="p" variant="headingLg" tone="success">
                    {completed}
                  </Text>
                </BlockStack>
              </Card>
            </Grid.Cell>
          </Grid>
        </Layout.Section>

        {/* Recent Activity List */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Requests
              </Text>
              {recentRequests.length === 0 ? (
                <Text as="p" tone="subdued">
                  No return or exchange requests have been submitted yet.
                </Text>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {recentRequests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        paddingBottom: "12px",
                        borderBottom: "1px solid #eeeeee",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <BlockStack gap="100">
                        <Link
                          to={`/app/requests/${req.id}`}
                          style={{
                            textDecoration: "none",
                            color: "#000000",
                            fontWeight: 600,
                          }}
                        >
                          Request {req.requestId} (Order {req.orderNumber})
                        </Link>
                        <Text as="span" tone="subdued">
                          Customer: {req.customerName || "N/A"}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Badge
                          tone={
                            req.status === "PENDING"
                              ? "attention"
                              : req.status === "COMPLETED"
                                ? "success"
                                : req.status === "REJECTED"
                                  ? "critical"
                                  : "info"
                          }
                        >
                          {req.status}
                        </Badge>
                        <Badge>{req.type}</Badge>
                      </InlineStack>
                    </div>
                  ))}
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

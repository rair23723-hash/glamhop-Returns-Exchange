import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  EmptyState,
  Layout,
  LegacyCard,
  Tabs,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import shopify from "../shopify.server";
import db from "../db.server";

// Loader: Fetches all requests
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const requests = await db.returnRequest.findMany({
    where: { shop },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return json({ requests });
};

export default function RequestsPage() {
  const { requests } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const currentTab = searchParams.get("tab") || "all";

  const handleTabChange = useCallback(
    (selectedTabIndex: number) => {
      const tabs = ["all", "pending", "approved", "rejected", "completed"];
      setSearchParams({ tab: tabs[selectedTabIndex] });
    },
    [setSearchParams]
  );

  const tabs = [
    { id: "all", content: "All Requests", accessibilityLabel: "All requests" },
    { id: "pending", content: "Pending", accessibilityLabel: "Pending review" },
    { id: "approved", content: "Approved", accessibilityLabel: "Approved requests" },
    { id: "rejected", content: "Rejected", accessibilityLabel: "Rejected requests" },
    { id: "completed", content: "Completed", accessibilityLabel: "Completed requests" },
  ];

  const selectedTabIndex = tabs.findIndex((t) => t.id === currentTab) !== -1 
    ? tabs.findIndex((t) => t.id === currentTab) 
    : 0;

  // Filter requests based on tab
  const filteredRequests = requests.filter((req) => {
    if (currentTab === "all") return true;
    if (currentTab === "pending") return req.status === "PENDING";
    if (currentTab === "approved") return req.status === "APPROVED";
    if (currentTab === "rejected") return req.status === "REJECTED";
    if (currentTab === "completed") return req.status === "COMPLETED";
    return true;
  });

  const resourceName = {
    singular: "request",
    plural: "requests",
  };

  const rowMarkup = filteredRequests.map(
    (
      {
        id,
        requestId,
        orderNumber,
        customerName,
        customerEmail,
        status,
        type,
        createdAt,
        items,
      },
      index
    ) => {
      const productSummary = items.map((i) => i.productTitle).join(", ");
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
    <Page title="All Requests">
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={handleTabChange}>
              <LegacyCard.Section>
                {filteredRequests.length === 0 ? (
                  <EmptyState
                    heading="No requests in this tab"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>No return or exchange requests match this status criteria.</p>
                  </EmptyState>
                ) : (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={filteredRequests.length}
                    headings={[
                      { title: "Request ID" },
                      { title: "Order" },
                      { title: "Customer" },
                      { title: "Email" },
                      { title: "Product" },
                      { title: "Type" },
                      { title: "Reason" },
                      { title: "Submitted Date" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {rowMarkup}
                  </IndexTable>
                )}
              </LegacyCard.Section>
            </Tabs>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

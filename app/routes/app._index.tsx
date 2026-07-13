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
  TextField,
  Select,
  Pagination,
  Button,
} from "@shopify/polaris";
import { useState } from "react";
import shopify from "../shopify.server";
import db from "../db.server";

// Loader: Authenticates the admin and computes KPIs + paginated search/filters
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const search = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "ALL";
  const type = url.searchParams.get("type") || "ALL";
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortDir = url.searchParams.get("sortDir") || "desc";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  const whereClause: any = { shop };

  if (search) {
    whereClause.OR = [
      { requestId: { contains: search, mode: "insensitive" } },
      { orderNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customerEmail: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status !== "ALL") {
    whereClause.status = status;
  }

  if (type !== "ALL") {
    whereClause.type = type;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalCount,
    requests,
    total,
    pending,
    approved,
    rejected,
    refunded,
    exchanged,
    todayReturns,
    monthlyReturns
  ] = await Promise.all([
    db.returnRequest.count({ where: whereClause }),
    db.returnRequest.findMany({
      where: whereClause,
      include: { items: true },
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.returnRequest.count({ where: { shop } }),
    db.returnRequest.count({ where: { shop, status: "PENDING" } }),
    db.returnRequest.count({ where: { shop, status: "APPROVED" } }),
    db.returnRequest.count({ where: { shop, status: "REJECTED" } }),
    db.returnRequest.count({ where: { shop, type: "RETURN", status: "COMPLETED" } }),
    db.returnRequest.count({ where: { shop, type: "EXCHANGE", status: "COMPLETED" } }),
    db.returnRequest.count({ where: { shop, createdAt: { gte: startOfToday } } }),
    db.returnRequest.count({ where: { shop, createdAt: { gte: startOfMonth } } }),
  ]);

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
    requests,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
    filters: {
      search,
      status,
      type,
      sortBy,
      sortDir,
    }
  });
};

export default function Index() {
  const { kpis, requests, pagination, filters } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [queryInput, setQueryInput] = useState(filters.search);
  const [statusInput, setStatusInput] = useState(filters.status);
  const [typeInput, setTypeInput] = useState(filters.type);
  const [sortInput, setSortInput] = useState(`${filters.sortBy}:${filters.sortDir}`);

  const applyFilters = (params: { query?: string; status?: string; type?: string; sort?: string; page?: number }) => {
    const searchParams = new URLSearchParams(window.location.search);
    if (params.query !== undefined) {
      if (params.query) searchParams.set("query", params.query);
      else searchParams.delete("query");
    }
    if (params.status !== undefined) {
      if (params.status !== "ALL") searchParams.set("status", params.status);
      else searchParams.delete("status");
    }
    if (params.type !== undefined) {
      if (params.type !== "ALL") searchParams.set("type", params.type);
      else searchParams.delete("type");
    }
    if (params.sort !== undefined) {
      const [sortBy, sortDir] = params.sort.split(":");
      searchParams.set("sortBy", sortBy);
      searchParams.set("sortDir", sortDir);
    }
    if (params.page !== undefined) {
      searchParams.set("page", params.page.toString());
    } else {
      searchParams.set("page", "1");
    }
    navigate(`?${searchParams.toString()}`);
  };

  const resourceName = {
    singular: "return request",
    plural: "return requests",
  };

  const getStatusBadgeTone = (status: string) => {
    switch (status) {
      case "PENDING":
        return "attention"; // Yellow
      case "APPROVED":
        return "success"; // Green
      case "REJECTED":
        return "critical"; // Red
      case "COMPLETED":
        return "info"; // Blue
      default:
        return "info";
    }
  };

  const rowMarkup = requests.map(
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
            <Badge tone={getStatusBadgeTone(status)}>
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

        {/* Filter Section */}
        <Card padding="400">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">Filter Return Activity</Text>
              <Button
                variant="plain"
                onClick={() => {
                  setQueryInput("");
                  setStatusInput("ALL");
                  setTypeInput("ALL");
                  setSortInput("createdAt:desc");
                  navigate("?");
                }}
              >
                Clear Filters
              </Button>
            </InlineStack>

            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3 }}>
                <TextField
                  label="Search"
                  value={queryInput}
                  onChange={(val) => {
                    setQueryInput(val);
                    applyFilters({ query: val });
                  }}
                  placeholder="Request ID, Order, Name, Email"
                  autoComplete="off"
                  labelHidden
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Select
                  label="Status"
                  labelHidden
                  options={[
                    { label: "All Statuses", value: "ALL" },
                    { label: "Pending Review", value: "PENDING" },
                    { label: "Approved", value: "APPROVED" },
                    { label: "Rejected", value: "REJECTED" },
                    { label: "Completed", value: "COMPLETED" },
                  ]}
                  value={statusInput}
                  onChange={(val) => {
                    setStatusInput(val);
                    applyFilters({ status: val });
                  }}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <Select
                  label="Type"
                  labelHidden
                  options={[
                    { label: "All Types", value: "ALL" },
                    { label: "Return", value: "RETURN" },
                    { label: "Exchange", value: "EXCHANGE" },
                  ]}
                  value={typeInput}
                  onChange={(val) => {
                    setTypeInput(val);
                    applyFilters({ type: val });
                  }}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3 }}>
                <Select
                  label="Sort by"
                  labelHidden
                  options={[
                    { label: "Newest First", value: "createdAt:desc" },
                    { label: "Oldest First", value: "createdAt:asc" },
                    { label: "Order Number (High to Low)", value: "orderNumber:desc" },
                    { label: "Order Number (Low to High)", value: "orderNumber:asc" },
                  ]}
                  value={sortInput}
                  onChange={(val) => {
                    setSortInput(val);
                    applyFilters({ sort: val });
                  }}
                />
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>

        {/* Requests Table Activity */}
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <BlockStack gap="400">
                <Box padding="400">
                  <Text variant="headingMd" as="h2">Recent Return Activity</Text>
                </Box>
                {requests.length === 0 ? (
                  <Box padding="400">
                    <EmptyState
                      heading="No requests found"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>No return or exchange requests match your filter criteria.</p>
                    </EmptyState>
                  </Box>
                ) : (
                  <>
                    <IndexTable
                      resourceName={resourceName}
                      itemCount={requests.length}
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
                    {pagination.totalPages > 1 && (
                      <>
                        <Divider />
                        <Box padding="400">
                        <InlineStack align="center">
                          <Pagination
                            hasPrevious={pagination.page > 1}
                            onPrevious={() => applyFilters({ page: pagination.page - 1 })}
                            hasNext={pagination.page < pagination.totalPages}
                            onNext={() => applyFilters({ page: pagination.page + 1 })}
                          />
                        </InlineStack>
                      </Box>
                      </>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

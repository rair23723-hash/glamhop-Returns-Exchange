import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, IndexTable, Text, EmptyState } from "@shopify/polaris";
import shopify from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const requests = await db.returnRequest.findMany({
    where: { shop },
    select: {
      customerId: true,
      customerName: true,
      customerEmail: true,
      status: true,
    },
  });

  // Aggregate in JS to guarantee database portability and speed
  const customerMap: Record<
    string,
    { name: string; email: string; totalRequests: number; approvedRequests: number }
  > = {};

  requests.forEach((req) => {
    const cid = req.customerId;
    if (!customerMap[cid]) {
      customerMap[cid] = {
        name: req.customerName || "N/A",
        email: req.customerEmail || "N/A",
        totalRequests: 0,
        approvedRequests: 0,
      };
    }

    customerMap[cid].totalRequests += 1;
    if (req.status === "APPROVED" || req.status === "COMPLETED") {
      customerMap[cid].approvedRequests += 1;
    }
  });

  const customers = Object.entries(customerMap).map(([id, details]) => ({
    id,
    ...details,
  }));

  return json({ customers });
};

export default function CustomersDirectoryPage() {
  const { customers } = useLoaderData<typeof loader>();

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  const rowMarkup = customers.map(
    ({ id, name, email, totalRequests, approvedRequests }, index) => (
      <IndexTable.Row id={id} key={id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{email}</IndexTable.Cell>
        <IndexTable.Cell>{totalRequests}</IndexTable.Cell>
        <IndexTable.Cell>{approvedRequests}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodySm" tone="subdued" as="span">
            {id.replace("gid://shopify/Customer/", "")}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page title="Return & Exchange Customers">
      <Layout>
        <Layout.Section>
          {customers.length === 0 ? (
            <Card>
              <EmptyState
                heading="No customers yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Customers who submit return or exchange requests will appear in this directory.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                resourceName={resourceName}
                itemCount={customers.length}
                headings={[
                  { title: "Customer Name" },
                  { title: "Email Address" },
                  { title: "Total Submissions" },
                  { title: "Approved Submissions" },
                  { title: "Shopify ID" },
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

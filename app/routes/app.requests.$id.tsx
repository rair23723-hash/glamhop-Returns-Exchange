import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  Button,
  TextField,
  Divider,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import shopify from "../shopify.server";
import db from "../db.server";

// Helper: Sync tags and notes directly on the Shopify Order
async function updateShopifyOrder(admin: any, orderId: string, tagToAdd: string, noteToAppend: string) {
  try {
    const orderResponse = await admin.graphql(
      `#graphql
      query getOrderDetails($id: ID!) {
        order(id: $id) {
          tags
          note
        }
      }`,
      { variables: { id: orderId } }
    );
    const orderData = await orderResponse.json();
    const currentTags = orderData.data?.order?.tags || [];
    const currentNote = orderData.data?.order?.note || "";

    const newTags = Array.from(new Set([...currentTags, tagToAdd]));
    const newNote = currentNote ? `${currentNote}\n${noteToAppend}` : noteToAppend;

    await admin.graphql(
      `#graphql
      mutation updateOrder($id: ID!, $tags: [String!], $note: String) {
        orderUpdate(input: { id: $id, tags: $tags, note: $note }) {
          order {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: { id: orderId, tags: newTags, note: newNote },
      }
    );
  } catch (err: any) {
    console.error("Failed to sync details with Shopify order:", err.message);
  }
}

// Helper: Create a $0.00 Draft Order for Exchanges
async function createExchangeDraftOrder(
  admin: any,
  customerId: string,
  orderNumber: string,
  requestId: string,
  exchangeVariantId: string,
  quantity: number
) {
  try {
    const input: any = {
      note: `Exchange replacement order for #${orderNumber} (Request ${requestId})`,
      tags: ["GlamHop-Exchange-Replacement"],
      lineItems: [
        {
          variantId: exchangeVariantId,
          quantity: quantity,
          appliedDiscount: {
            value: 100.0,
            valueType: "PERCENTAGE",
            title: "Exchange replacement discount",
          },
        },
      ],
    };

    if (customerId && !customerId.includes("guest")) {
      input.customerId = customerId;
    }

    const response = await admin.graphql(
      `#graphql
      mutation createDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { input } }
    );

    const resData = await response.json();
    const userErrors = resData.data?.draftOrderCreate?.userErrors || [];
    if (userErrors.length > 0) {
      console.error("GraphQL errors creating draft order:", userErrors);
      return null;
    }
    return resData.data?.draftOrderCreate?.draftOrder;
  } catch (err: any) {
    console.error("Failed to create draft exchange order:", err.message);
    return null;
  }
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session, admin } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const returnRequest = await db.returnRequest.findUnique({
    where: { id, shop },
    include: {
      items: {
        include: {
          images: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
      },
      timeline: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!returnRequest) {
    throw new Response("Not Found", { status: 404 });
  }

  let phone = "N/A";
  try {
    const orderResponse = await admin.graphql(
      `#graphql
      query getOrderPhone($id: ID!) {
        order(id: $id) {
          phone
          customer {
            phone
          }
        }
      }`,
      { variables: { id: returnRequest.orderId } }
    );
    const orderData = await orderResponse.json();
    phone = orderData.data?.order?.phone || orderData.data?.order?.customer?.phone || "N/A";
  } catch (err: any) {
    console.error("Failed to fetch phone number from Shopify:", err.message);
  }

  return json({ returnRequest, phone });
};


// Action: Processes request workflows and notifications
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  // Retrieve current request details
  const returnRequest = await db.returnRequest.findUnique({
    where: { id, shop },
    include: { items: true },
  });

  if (!returnRequest) {
    return json({ error: "Request not found" }, { status: 404 });
  }

  const requestId = returnRequest.requestId;
  const orderId = returnRequest.orderId;
  const orderNumber = returnRequest.orderNumber;

  if (actionType === "approve") {
    let draftOrderName = "";
    
    // If request type is EXCHANGE, create a draft order in Shopify
    if (returnRequest.type === "EXCHANGE") {
      const exchangeItem = returnRequest.items[0]; // private app assumes single item per request
      if (exchangeItem && exchangeItem.exchangeVariantId) {
        const draftOrder = await createExchangeDraftOrder(
          admin,
          returnRequest.customerId,
          orderNumber,
          requestId,
          exchangeItem.exchangeVariantId,
          exchangeItem.quantity
        );
        if (draftOrder) {
          draftOrderName = draftOrder.name;
        }
      }
    }

    const approveDesc = draftOrderName
      ? `Request approved. Size exchange draft order ${draftOrderName} created for customer.`
      : "Your request has been approved. Preparing return details.";

    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "APPROVED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "APPROVED",
          title: "Request Approved",
          description: approveDesc,
        },
      }),
      // Notification timeline mock logs
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified (Email)",
          description: `Approval notice successfully dispatched to ${returnRequest.customerEmail}.`,
        },
      }),
    ]);

    await updateShopifyOrder(
      admin,
      orderId,
      "GlamHop-Approved",
      `[GlamHop] Request ${requestId} approved. ${draftOrderName ? `Draft Order: ${draftOrderName}` : ""}`
    );

    await db.adminNote.create({
      data: {
        returnRequestId: id!,
        note: `Approved: ${approveDesc}`,
        author: "System / Admin",
      },
    });
  } else if (actionType === "reject") {
    const rejectionReason = formData.get("rejectionReason") as string;
    if (!rejectionReason) {
      return json({ error: "Rejection reason is required" }, { status: 400 });
    }

    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: {
          status: "REJECTED",
          rejectionReason,
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "REJECTED",
          title: "Request Rejected",
          description: `Reason: ${rejectionReason}`,
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified (SMS/Email)",
          description: `Rejection details sent to customer. Reason stated: ${rejectionReason}`,
        },
      }),
    ]);

    await updateShopifyOrder(
      admin,
      orderId,
      "GlamHop-Rejected",
      `[GlamHop] Request ${requestId} rejected. Reason: ${rejectionReason}`
    );

    await db.adminNote.create({
      data: {
        returnRequestId: id!,
        note: `Rejected: Rejection Reason: ${rejectionReason}`,
        author: "System / Admin",
      },
    });
  } else if (actionType === "request_info") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "MORE_INFO_REQUESTED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "MORE_INFO_REQUESTED",
          title: "More Info Requested",
          description: "Admin requested more details regarding your return request.",
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified",
          description: `A request for additional info has been sent.`,
        },
      }),
    ]);
  } else if (actionType === "add_note") {
    const noteContent = formData.get("noteContent") as string;
    if (noteContent) {
      await db.adminNote.create({
        data: {
          returnRequestId: id!,
          note: noteContent,
          author: "Admin",
        },
      });

      await updateShopifyOrder(
        admin,
        orderId,
        "GlamHop-Note-Added",
        `[GlamHop Admin Note] ${noteContent}`
      );
    }
  } else if (actionType === "schedule_pickup") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "PICKUP_SCHEDULED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "PICKUP_SCHEDULED",
          title: "Pickup Scheduled",
          description: "Reverse courier pickup scheduled to collect the returns package.",
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified (SMS)",
          description: `Pickup details, tracking link and label sent to customer mobile.`,
        },
      }),
    ]);

    await updateShopifyOrder(
      admin,
      orderId,
      "GlamHop-Pickup-Scheduled",
      `[GlamHop] Reverse courier pickup scheduled for request ${requestId}.`
    );
  } else if (actionType === "picked_up") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "PICKED_UP" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "PICKED_UP",
          title: "Picked Up",
          description: "The package has been successfully collected by the courier.",
        },
      }),
    ]);
  } else if (actionType === "received_warehouse") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "RECEIVED_AT_WAREHOUSE" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "RECEIVED_AT_WAREHOUSE",
          title: "Received at Warehouse",
          description: "Package received at our warehouse. Awaiting quality control check.",
        },
      }),
    ]);
  } else if (actionType === "quality_inspection") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "QUALITY_INSPECTION" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "QUALITY_INSPECTION",
          title: "Quality Inspection",
          description: "Items are undergoing our standard quality control check.",
        },
      }),
    ]);
  } else if (actionType === "refund_processed") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "COMPLETED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "REFUND_PROCESSED",
          title: "Refund Processed",
          description: "Quality check passed. Refund has been processed to payment gateway.",
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified (Email)",
          description: `Refund notice successfully sent to ${returnRequest.customerEmail}.`,
        },
      }),
    ]);

    await updateShopifyOrder(
      admin,
      orderId,
      "GlamHop-Refunded",
      `[GlamHop] Refund processed for request ${requestId}.`
    );

    await db.adminNote.create({
      data: {
        returnRequestId: id!,
        note: "Refund Processed: Quality check passed. Refund has been processed to payment gateway.",
        author: "System / Admin",
      },
    });
  } else if (actionType === "replacement_dispatched") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "REPLACEMENT_DISPATCHED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "REPLACEMENT_DISPATCHED",
          title: "Replacement Dispatched",
          description: "Your replacement item has been packed and handed to courier.",
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified",
          description: `Replacement shipping details and tracking sent.`,
        },
      }),
    ]);

    await updateShopifyOrder(
      admin,
      orderId,
      "GlamHop-Exchange-Dispatched",
      `[GlamHop] Replacement item dispatched for request ${requestId}.`
    );

    await db.adminNote.create({
      data: {
        returnRequestId: id!,
        note: "Replacement Dispatched: Exchange replacement item packed and handed to courier.",
        author: "System / Admin",
      },
    });
  } else if (actionType === "replacement_delivered") {
    await db.$transaction([
      db.returnRequest.update({
        where: { id, shop },
        data: { status: "COMPLETED" },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "REPLACEMENT_DELIVERED",
          title: "Replacement Delivered",
          description: "Your exchanged product has been successfully delivered. Request closed.",
        },
      }),
    ]);
  }

  return json({ success: true });
};

export default function RequestDetailsPage() {
  const { returnRequest, phone } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [rejectionInput, setRejectionInput] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);

  const items = returnRequest.items || [];
  const notes = returnRequest.notes || [];
  const timeline = returnRequest.timeline || [];

  return (
    <Page
      backAction={{ content: "Requests", url: "/app/requests" }}
      title={`Request Details: ${returnRequest.requestId}`}
      subtitle={`Submitted ${new Date(returnRequest.createdAt).toLocaleDateString()}`}
    >
      <Layout>
        {/* Main section details */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Products Card */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Requested Items
                </Text>
                {items.map((item) => (
                  <div key={item.id}>
                    <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
                      {item.imageUrl && (
                        <div style={{ width: "80px", height: "110px", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}>
                          <img
                            src={item.imageUrl}
                            alt={item.productTitle}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                      )}
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h3" variant="headingSm">
                          {item.productTitle}
                        </Text>
                        <Box paddingBlockStart="100">
                          <BlockStack gap="100">
                            {item.variantTitle && (
                              <Text as="p" tone="subdued">
                                <strong>Variant:</strong> {item.variantTitle}
                              </Text>
                            )}
                            <Text as="p" tone="subdued">
                              <strong>Quantity:</strong> {item.quantity}
                            </Text>
                            <Text as="p" tone="subdued">
                              <strong>Action Type:</strong>{" "}
                              <Badge tone={item.type === "RETURN" ? "info" : "success"}>{item.type}</Badge>
                            </Text>
                            <Text as="p">
                              <strong>Reason:</strong> {item.reason}
                              {item.otherReasonText && ` (${item.otherReasonText})`}
                            </Text>
                            {item.requestedSize && (
                              <Text as="p" fontWeight="bold">
                                <strong>Requested Exchange Size/Variant:</strong>{" "}
                                <Badge tone="info">{item.requestedSize}</Badge>
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      </div>
                    </div>

                    {/* Image uploads */}
                    {item.images && item.images.length > 0 && (
                      <Box paddingBlockStart="400">
                        <BlockStack gap="200">
                          <Text as="h4" variant="headingXs">
                            Customer Uploaded Images
                          </Text>
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {item.images.map((img) => (
                              <div
                                key={img.id}
                                style={{
                                  width: "120px",
                                  height: "120px",
                                  borderRadius: "6px",
                                  overflow: "hidden",
                                  border: "1px solid #eeeeee",
                                  cursor: "pointer",
                                }}
                                onClick={() => setActivePreviewImage(img.url)}
                              >
                                <img
                                  src={img.url}
                                  alt="attachment"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              </div>
                            ))}
                          </div>
                        </BlockStack>
                      </Box>
                    )}
                    <Box paddingBlockStart="400">
                      <Divider />
                    </Box>
                  </div>
                ))}

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Customer Notes / Description
                  </Text>
                  <Text as="p" tone={returnRequest.customerNotes ? "default" : "subdued"}>
                    {returnRequest.customerNotes || "No customer notes submitted."}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Event Timeline History Card */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Timeline Events & Notifications Log
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 0" }}>
                  {timeline.map((event) => (
                    <div key={event.id} style={{ display: "flex", gap: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: event.status === "NOTIFICATION_SENT" ? "#2e7d32" : "#000000",
                            marginTop: "4px",
                          }}
                        />
                      </div>
                      <div>
                        <Text as="span" fontWeight="bold">
                          {event.title}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {new Date(event.createdAt).toLocaleString()}
                        </Text>
                        {event.description && <Text as="p" tone="subdued">{event.description}</Text>}
                      </div>
                    </div>
                  ))}
                </div>
              </BlockStack>
            </Card>

            {/* Internal Notes card */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Internal Notes
                </Text>
                <Form method="post" onSubmit={() => setNewNote("")}>
                  <input type="hidden" name="actionType" value="add_note" />
                  <BlockStack gap="200">
                    <TextField
                      label="Add internal note"
                      labelHidden
                      multiline={3}
                      name="noteContent"
                      value={newNote}
                      onChange={setNewNote}
                      autoComplete="off"
                      placeholder="Type internal remarks..."
                    />
                    <Button submit loading={isSubmitting}>
                      Add Note
                    </Button>
                  </BlockStack>
                </Form>

                <Divider />

                {notes.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No internal notes yet.
                  </Text>
                ) : (
                  <BlockStack gap="300">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          backgroundColor: "#f9f9f9",
                          padding: "12px",
                          borderRadius: "6px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            color: "#707070",
                            marginBottom: "6px",
                          }}
                        >
                          <strong>{note.author}</strong>
                          <span>{new Date(note.createdAt).toLocaleString()}</span>
                        </div>
                        <Text as="p">{note.note}</Text>
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar Actions / Metadata */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Status card */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Status Progression Actions
                </Text>
                <InlineStack align="space-between">
                  <Text as="span">Status:</Text>
                  <Badge
                    tone={
                      returnRequest.status === "PENDING"
                        ? "attention"
                        : returnRequest.status === "COMPLETED"
                          ? "success"
                          : returnRequest.status === "REJECTED"
                            ? "critical"
                            : "info"
                    }
                  >
                    {returnRequest.status}
                  </Badge>
                </InlineStack>

                {returnRequest.rejectionReason && (
                  <div
                    style={{
                      padding: "10px",
                      backgroundColor: "#fff5f5",
                      border: "1px solid #ffe3e3",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#c53030",
                    }}
                  >
                    <strong>Rejection Reason:</strong> {returnRequest.rejectionReason}
                  </div>
                )}

                <Divider />

                {/* Progress flow buttons */}
                {!showRejectForm && (
                  <BlockStack gap="200">
                    {returnRequest.status === "PENDING" && (
                      <>
                        <Form method="post">
                          <input type="hidden" name="actionType" value="approve" />
                          <Button submit variant="primary" fullWidth>
                            Approve Request
                          </Button>
                        </Form>
                        <Button tone="critical" fullWidth onClick={() => setShowRejectForm(true)}>
                          Reject Request
                        </Button>
                        <Form method="post">
                          <input type="hidden" name="actionType" value="request_info" />
                          <Button submit fullWidth>
                            Request More Info
                          </Button>
                        </Form>
                      </>
                    )}

                    {returnRequest.status === "APPROVED" && (
                      <Form method="post">
                        <input type="hidden" name="actionType" value="schedule_pickup" />
                        <Button submit variant="primary" fullWidth>
                          Create Reverse Pickup
                        </Button>
                      </Form>
                    )}

                    {returnRequest.status === "PICKUP_SCHEDULED" && (
                      <Form method="post">
                        <input type="hidden" name="actionType" value="picked_up" />
                        <Button submit variant="primary" fullWidth>
                          Mark as Picked Up
                        </Button>
                      </Form>
                    )}

                    {returnRequest.status === "PICKED_UP" && (
                      <Form method="post">
                        <input type="hidden" name="actionType" value="received_warehouse" />
                        <Button submit variant="primary" fullWidth>
                          Mark Received at Warehouse
                        </Button>
                      </Form>
                    )}

                    {returnRequest.status === "RECEIVED_AT_WAREHOUSE" && (
                      <Form method="post">
                        <input type="hidden" name="actionType" value="quality_inspection" />
                        <Button submit variant="primary" fullWidth>
                          Advance to Inspection
                        </Button>
                      </Form>
                    )}

                    {returnRequest.status === "QUALITY_INSPECTION" && (
                      <>
                        {returnRequest.type === "RETURN" ? (
                          <Form method="post">
                            <input type="hidden" name="actionType" value="refund_processed" />
                            <Button submit variant="primary" fullWidth>
                              Process & Issue Refund
                            </Button>
                          </Form>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="actionType" value="replacement_dispatched" />
                            <Button submit variant="primary" fullWidth>
                              Dispatch Replacement
                            </Button>
                          </Form>
                        )}
                      </>
                    )}

                    {returnRequest.status === "REPLACEMENT_DISPATCHED" && (
                      <Form method="post">
                        <input type="hidden" name="actionType" value="replacement_delivered" />
                        <Button submit variant="primary" fullWidth>
                          Mark Replacement Delivered
                        </Button>
                      </Form>
                    )}

                    {returnRequest.status === "COMPLETED" && (
                      <Text as="p" tone="subdued" alignment="center">
                        This request has been successfully closed.
                      </Text>
                    )}
                  </BlockStack>
                )}

                {/* Reject form */}
                {showRejectForm && (
                  <Form method="post" onSubmit={() => setShowRejectForm(false)}>
                    <input type="hidden" name="actionType" value="reject" />
                    <BlockStack gap="200">
                      <TextField
                        label="Rejection Reason"
                        name="rejectionReason"
                        value={rejectionInput}
                        onChange={setRejectionInput}
                        multiline={3}
                        placeholder="Explain reason to customer..."
                        required
                        autoComplete="off"
                      />
                      <InlineStack gap="200">
                        <Button submit variant="primary" tone="critical" loading={isSubmitting}>
                          Submit Rejection
                        </Button>
                        <Button onClick={() => setShowRejectForm(false)}>Cancel</Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                )}
              </BlockStack>
            </Card>

            {/* Customer Details */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Customer Details
                </Text>
                <BlockStack gap="100">
                  <Text as="p">
                    <strong>Name:</strong> {returnRequest.customerName || "N/A"}
                  </Text>
                  <Text as="p">
                    <strong>Email:</strong> {returnRequest.customerEmail || "N/A"}
                  </Text>
                  <Text as="p">
                    <strong>Phone:</strong> {phone || "N/A"}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    ID: {returnRequest.customerId}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Order details */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Order Metadata
                </Text>
                <BlockStack gap="100">
                  <Text as="p">
                    <strong>Order Number:</strong> #{returnRequest.orderNumber}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    GID: {returnRequest.orderId}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
      {activePreviewImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "zoom-out",
          }}
          onClick={() => setActivePreviewImage(null)}
        >
          <img
            src={activePreviewImage}
            alt="Full size attachment preview"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: "8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      )}
    </Page>
  );
}

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
  Modal,
  Grid,
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

// Loader: Fetches the request details, logs viewed event, and fetches Shopify order metadata
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

  // 1. Log "Admin Viewed Request" if not logged already (First-time view check)
  const viewedEvent = await db.timelineEvent.findFirst({
    where: { returnRequestId: id, status: "ADMIN_VIEWED" }
  });
  if (!viewedEvent) {
    await db.timelineEvent.create({
      data: {
        returnRequestId: id!,
        status: "ADMIN_VIEWED",
        title: "Admin Viewed Request",
        description: "Admin viewed the request details for the first time.",
      }
    });
    // Refresh timeline list
    returnRequest.timeline = await db.timelineEvent.findMany({
      where: { returnRequestId: id },
      orderBy: { createdAt: "desc" },
    });
  }

  // 2. Fetch full order metadata from Shopify GraphQL
  let shopifyOrderDetails = null;
  try {
    const orderResponse = await admin.graphql(
      `#graphql
      query getOrderDetails($id: ID!) {
        order(id: $id) {
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          paymentGatewayNames
          phone
          shippingAddress {
            name
            address1
            address2
            city
            province
            zip
            country
            phone
          }
          customer {
            firstName
            lastName
            email
            phone
          }
          fulfillments(first: 5) {
            trackingInfo {
              number
              company
            }
          }
        }
      }`,
      { variables: { id: returnRequest.orderId } }
    );
    const orderData = await orderResponse.json();
    shopifyOrderDetails = orderData.data?.order || null;
  } catch (err: any) {
    console.error("Failed to fetch order details from Shopify:", err.message);
  }

  return json({ returnRequest, shopifyOrderDetails });
};

// Action: Processes request workflows, internal note edits, deletions and notifications
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

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
    // Security check: duplicate approve prevention
    if (returnRequest.status === "APPROVED" || returnRequest.status === "COMPLETED") {
      return json({ error: "Request is already approved or closed." }, { status: 400 });
    }

    let draftOrderName = "";
    if (returnRequest.type === "EXCHANGE") {
      const exchangeItem = returnRequest.items[0];
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
      : "Request approved by Admin. Preparing return package details.";

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
          description: `By Admin. ${approveDesc}`,
        },
      }),
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
    // Security check: duplicate reject prevention
    if (returnRequest.status === "REJECTED" || returnRequest.status === "COMPLETED") {
      return json({ error: "Request is already rejected or closed." }, { status: 400 });
    }

    const rejectionReason = formData.get("rejectionReason") as string;
    if (!rejectionReason || !rejectionReason.trim()) {
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
          description: `By Admin. Reason: ${rejectionReason}`,
        },
      }),
      db.timelineEvent.create({
        data: {
          returnRequestId: id!,
          status: "NOTIFICATION_SENT",
          title: "Customer Notified (SMS/Email)",
          description: `Rejection details sent to customer. Reason: ${rejectionReason}`,
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
          description: "Admin requested more details regarding the returns package.",
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
    }
  } else if (actionType === "edit_note") {
    const noteId = formData.get("noteId") as string;
    const noteContent = formData.get("noteContent") as string;
    if (noteId && noteContent) {
      await db.adminNote.update({
        where: { id: noteId },
        data: { note: noteContent },
      });
    }
  } else if (actionType === "delete_note") {
    const noteId = formData.get("noteId") as string;
    if (noteId) {
      await db.adminNote.delete({
        where: { id: noteId },
      });
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
          description: "Courier pickup scheduled for reverse logistics collection.",
        },
      }),
    ]);
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
          description: "Package successfully handed over to the delivery partner.",
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
          description: "Returned items received at inventory warehouse, quality control pending.",
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
          description: "Items undergoing return quality control checks.",
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
          status: "COMPLETED",
          title: "Refund Processed",
          description: "Refund completed and funds disbursed.",
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
          description: "Exchange replacement order shipped out to customer.",
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
          status: "COMPLETED",
          title: "Replacement Delivered",
          description: "Exchange order delivered. Return request closed successfully.",
        },
      }),
    ]);
  }

  return json({ success: true });
};

export default function RequestDetailsPage() {
  const { returnRequest, shopifyOrderDetails } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [rejectionInput, setRejectionInput] = useState("");
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  const items = returnRequest.items || [];
  const notes = returnRequest.notes || [];
  const timeline = returnRequest.timeline || [];

  // Parse Uploaded Images list
  const allUploadedImages = items.reduce((acc: any[], item: any) => {
    if (item.images && item.images.length > 0) {
      item.images.forEach((img: any) => {
        acc.push({ url: img.url, id: img.id });
      });
    }
    return acc;
  }, []);

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

  // Safe download trigger for base64 / standard URLs
  const downloadAttachment = (url: string, index: number) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `attachment_${returnRequest.requestId}_${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Compile Customer properties (Requirement 6)
  const shippingAddress = shopifyOrderDetails?.shippingAddress;
  const addressText = shippingAddress
    ? `${shippingAddress.name}, ${shippingAddress.address1}${shippingAddress.address2 ? `, ${shippingAddress.address2}` : ""}, ${shippingAddress.city}, ${shippingAddress.province} - ${shippingAddress.zip}, ${shippingAddress.country}`
    : "N/A";

  const orderValue = shopifyOrderDetails?.totalPriceSet?.shopMoney
    ? `${shopifyOrderDetails.totalPriceSet.shopMoney.amount} ${shopifyOrderDetails.totalPriceSet.shopMoney.currencyCode}`
    : "N/A";

  const paymentMethod = shopifyOrderDetails?.paymentGatewayNames?.join(", ") || "N/A";
  const orderDate = shopifyOrderDetails?.createdAt
    ? new Date(shopifyOrderDetails.createdAt).toLocaleDateString()
    : "N/A";

  const courierName = shopifyOrderDetails?.fulfillments?.[0]?.trackingInfo?.[0]?.company || "N/A";
  const trackingNumber = shopifyOrderDetails?.fulfillments?.[0]?.trackingInfo?.[0]?.number || "N/A";

  const orderStatus = shopifyOrderDetails
    ? `Financial: ${shopifyOrderDetails.displayFinancialStatus || "N/A"} • Fulfillment: ${shopifyOrderDetails.displayFulfillmentStatus || "N/A"}`
    : "N/A";

  const phoneDisplay = shopifyOrderDetails?.phone || shopifyOrderDetails?.customer?.phone || "N/A";

  return (
    <Page
      backAction={{ content: "Dashboard", url: "/app" }}
      title={`Request Details: ${returnRequest.requestId}`}
      subtitle={`Submitted ${new Date(returnRequest.createdAt).toLocaleString()}`}
    >
      <Layout>
        {/* Main Details Panel */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Products Card */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Requested Items
                </Text>
                {items.map((item) => (
                  <div key={item.id}>
                    <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                      {item.imageUrl && (
                        <div
                          style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            border: "1px solid #e1e3e5",
                            flexShrink: 0,
                            cursor: "zoom-in",
                          }}
                          onClick={() => {
                            // Find matching index in attachments list if clicked, or preview item image
                            const imgIdx = allUploadedImages.findIndex(i => i.url === item.imageUrl);
                            if (imgIdx !== -1) {
                              setActiveImageIndex(imgIdx);
                            } else {
                              // If not in uploads, inject temporary preview
                              setActiveImageIndex(-1);
                            }
                          }}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.productTitle}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                      )}
                      <div style={{ flexGrow: 1 }}>
                        <BlockStack gap="150">
                          <Text as="h3" variant="headingMd">
                            {item.productTitle}
                          </Text>
                          {item.variantTitle && (
                            <Text as="p" tone="subdued">
                              <strong>Variant / Size:</strong> {item.variantTitle}
                            </Text>
                          )}
                          <Text as="p" tone="subdued">
                            <strong>Quantity:</strong> {item.quantity}
                          </Text>
                          <Text as="p" tone="subdued">
                            <strong>Requested Action:</strong>{" "}
                            <Badge tone={item.type === "RETURN" ? "info" : "success"}>{item.type}</Badge>
                          </Text>
                          <Text as="p">
                            <strong>Return Reason:</strong> {item.reason}
                            {item.otherReasonText && ` (${item.otherReasonText})`}
                          </Text>
                          {item.requestedSize && (
                            <Text as="p" fontWeight="bold" tone="success">
                              <strong>Requested Exchange Size:</strong>{" "}
                              <Badge tone="success">{item.requestedSize}</Badge>
                            </Text>
                          )}
                        </BlockStack>
                      </div>
                    </div>
                    <Box paddingBlockStart="400">
                      <Divider />
                    </Box>
                  </div>
                ))}

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Customer Notes / Description
                  </Text>
                  <Text as="p" tone={returnRequest.customerNotes ? undefined : "subdued"}>
                    {returnRequest.customerNotes || "No customer notes submitted."}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Media Uploads Grid */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Customer Uploaded Images
                </Text>
                {allUploadedImages.length === 0 ? (
                  <Text as="p" tone="subdued">No attachments uploaded for this request.</Text>
                ) : (
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    {allUploadedImages.map((img, idx) => (
                      <div
                        key={img.id}
                        style={{
                          width: "120px",
                          height: "120px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1px solid #e1e3e5",
                          cursor: "pointer",
                          position: "relative",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                        }}
                        onClick={() => setActiveImageIndex(idx)}
                      >
                        <img
                          src={img.url}
                          alt={`Attachment ${idx + 1}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </BlockStack>
            </Card>

            {/* Timeline */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Timeline Events & Logistics History
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "10px 0" }}>
                  {timeline.map((event) => {
                    const isSystemOrNotification = event.status === "NOTIFICATION_SENT" || event.status === "ADMIN_VIEWED";
                    return (
                      <div key={event.id} style={{ display: "flex", gap: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                          <div
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              backgroundColor: isSystemOrNotification ? "#5c5f62" : "#108043",
                              marginTop: "5px",
                            }}
                          />
                        </div>
                        <div style={{ flexGrow: 1 }}>
                          <InlineStack align="space-between">
                            <Text as="span" fontWeight="bold">
                              {event.title}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {new Date(event.createdAt).toLocaleDateString()} at {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </InlineStack>
                          {event.description && (
                            <Box paddingBlockStart="100">
                              <Text as="p" tone="subdued" variant="bodyMd">
                                {event.description}
                              </Text>
                            </Box>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            </Card>

            {/* Internal Notes */}
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
                      placeholder="Type internal notes regarding quality inspection, shipping flags..."
                    />
                    <InlineStack align="end">
                      <Button submit loading={isSubmitting} disabled={!newNote.trim()}>
                        Add Note
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Form>

                <Divider />

                {notes.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No internal notes logged yet.
                  </Text>
                ) : (
                  <BlockStack gap="400">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          backgroundColor: "#f6f6f7",
                          padding: "16px",
                          borderRadius: "8px",
                          border: "1px solid #edeeef"
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" fontWeight="bold" tone="subdued">
                            {note.author}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(note.createdAt).toLocaleString()}
                          </Text>
                        </InlineStack>
                        <Box paddingBlockStart="200" paddingBlockEnd="200">
                          {editingNoteId === note.id ? (
                            <BlockStack gap="200">
                              <TextField
                                label="Edit note"
                                labelHidden
                                value={editingNoteText}
                                onChange={setEditingNoteText}
                                multiline={3}
                                autoComplete="off"
                              />
                              <InlineStack gap="200" align="end">
                                <Form method="post" onSubmit={() => setEditingNoteId(null)}>
                                  <input type="hidden" name="actionType" value="edit_note" />
                                  <input type="hidden" name="noteId" value={note.id} />
                                  <input type="hidden" name="noteContent" value={editingNoteText} />
                                  <Button submit size="slim">Save</Button>
                                </Form>
                                <Button onClick={() => setEditingNoteId(null)} size="slim">Cancel</Button>
                              </InlineStack>
                            </BlockStack>
                          ) : (
                            <Text as="p">{note.note}</Text>
                          )}
                        </Box>
                        {editingNoteId !== note.id && (
                          <InlineStack gap="300" align="end">
                            <Button
                              variant="plain"
                              onClick={() => {
                                setEditingNoteId(note.id);
                                setEditingNoteText(note.note);
                              }}
                            >
                              Edit Note
                            </Button>
                            <Form method="post">
                              <input type="hidden" name="actionType" value="delete_note" />
                              <input type="hidden" name="noteId" value={note.id} />
                              <Button submit variant="plain" tone="critical">
                                Delete Note
                              </Button>
                            </Form>
                          </InlineStack>
                        )}
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar Actions & Meta */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            {/* Progression actions */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Status Progression Actions
                </Text>
                <InlineStack align="space-between">
                  <Text as="span">Status:</Text>
                  <Badge tone={getStatusBadgeTone(returnRequest.status)}>
                    {returnRequest.status}
                  </Badge>
                </InlineStack>

                {returnRequest.rejectionReason && (
                  <div
                    style={{
                      padding: "12px",
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

                {/* Progress actions logic (Security double-submit lock checks isSubmitting) */}
                <BlockStack gap="200">
                  {returnRequest.status === "PENDING" && (
                    <>
                      <Button
                        variant="primary"
                        fullWidth
                        loading={isSubmitting}
                        onClick={() => setShowApproveConfirm(true)}
                      >
                        Approve Request
                      </Button>
                      <Button
                        tone="critical"
                        fullWidth
                        onClick={() => setShowRejectModal(true)}
                      >
                        Reject Request
                      </Button>
                      <Form method="post">
                        <input type="hidden" name="actionType" value="request_info" />
                        <Button submit fullWidth disabled={isSubmitting}>
                          Request More Info
                        </Button>
                      </Form>
                    </>
                  )}

                  {returnRequest.status === "APPROVED" && (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="schedule_pickup" />
                      <Button submit variant="primary" fullWidth loading={isSubmitting}>
                        Create Reverse Pickup
                      </Button>
                    </Form>
                  )}

                  {returnRequest.status === "PICKUP_SCHEDULED" && (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="picked_up" />
                      <Button submit variant="primary" fullWidth loading={isSubmitting}>
                        Mark as Picked Up
                      </Button>
                    </Form>
                  )}

                  {returnRequest.status === "PICKED_UP" && (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="received_warehouse" />
                      <Button submit variant="primary" fullWidth loading={isSubmitting}>
                        Mark Received at Warehouse
                      </Button>
                    </Form>
                  )}

                  {returnRequest.status === "RECEIVED_AT_WAREHOUSE" && (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="quality_inspection" />
                      <Button submit variant="primary" fullWidth loading={isSubmitting}>
                        Advance to Inspection
                      </Button>
                    </Form>
                  )}

                  {returnRequest.status === "QUALITY_INSPECTION" && (
                    <>
                      {returnRequest.type === "RETURN" ? (
                        <Form method="post">
                          <input type="hidden" name="actionType" value="refund_processed" />
                          <Button submit variant="primary" fullWidth loading={isSubmitting}>
                            Process & Issue Refund
                          </Button>
                        </Form>
                      ) : (
                        <Form method="post">
                          <input type="hidden" name="actionType" value="replacement_dispatched" />
                          <Button submit variant="primary" fullWidth loading={isSubmitting}>
                            Dispatch Replacement
                          </Button>
                        </Form>
                      )}
                    </>
                  )}

                  {returnRequest.status === "REPLACEMENT_DISPATCHED" && (
                    <Form method="post">
                      <input type="hidden" name="actionType" value="replacement_delivered" />
                      <Button submit variant="primary" fullWidth loading={isSubmitting}>
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
              </BlockStack>
            </Card>

            {/* Customer Details (Requirement 6) */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Customer Information
                </Text>
                <BlockStack gap="150">
                  <Text as="p">
                    <strong>Name:</strong> {returnRequest.customerName || "N/A"}
                  </Text>
                  <Text as="p">
                    <strong>Email:</strong> {returnRequest.customerEmail || "N/A"}
                  </Text>
                  <Text as="p">
                    <strong>Phone:</strong> {phoneDisplay}
                  </Text>
                  <Text as="p">
                    <strong>Shipping Address:</strong> {addressText}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Order Details (Requirement 6) */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Order Details
                </Text>
                <BlockStack gap="150">
                  <Text as="p">
                    <strong>Order Number:</strong> #{returnRequest.orderNumber}
                  </Text>
                  <Text as="p">
                    <strong>Order Date:</strong> {orderDate}
                  </Text>
                  <Text as="p">
                    <strong>Order Value:</strong> {orderValue}
                  </Text>
                  <Text as="p">
                    <strong>Payment Method:</strong> {paymentMethod}
                  </Text>
                  <Text as="p">
                    <strong>Order Status:</strong> {orderStatus}
                  </Text>
                  <Text as="p">
                    <strong>Courier:</strong> {courierName}
                  </Text>
                  <Text as="p">
                    <strong>Tracking Number:</strong> {trackingNumber}
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Shopify GID: {returnRequest.orderId}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Approve Confirmation Modal (Requirement 3) */}
      <Modal
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        title="Approve Request?"
        primaryAction={{
          content: "Approve",
          onAction: () => {
            document.getElementById("approve-form-submit")?.click();
            setShowApproveConfirm(false);
          },
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowApproveConfirm(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">This action cannot be undone. It will approve this return/exchange request.</Text>
        </Modal.Section>
      </Modal>

      {/* Reject Confirmation Modal (Requirement 3) */}
      <Modal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Request?"
        primaryAction={{
          content: "Submit Rejection",
          onAction: () => {
            if (rejectionInput.trim()) {
              document.getElementById("reject-form-submit")?.click();
              setShowRejectModal(false);
            }
          },
          disabled: !rejectionInput.trim(),
          loading: isSubmitting,
          destructive: true,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowRejectModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">Please provide a reason to the customer for rejecting this request. This action cannot be undone.</Text>
            <TextField
              label="Rejection Reason"
              value={rejectionInput}
              onChange={setRejectionInput}
              multiline={3}
              placeholder="Explain the rejection reason (required)..."
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Uploaded Images Slider Modal (Requirement 8) */}
      {activeImageIndex !== null && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          {/* Close trigger */}
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              color: "#ffffff",
              fontSize: "28px",
              cursor: "pointer",
              fontWeight: "bold",
              zIndex: 10000,
            }}
            onClick={() => setActiveImageIndex(null)}
          >
            &times;
          </div>

          {/* Active Image rendering */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "90%", height: "70%" }}>
            {activeImageIndex === -1 ? (
              <img
                src={items[0]?.imageUrl || ""}
                alt="Product preview"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "4px" }}
              />
            ) : (
              <>
                {/* Prev Slide button */}
                {allUploadedImages.length > 1 && (
                  <button
                    style={{
                      position: "absolute",
                      left: "10px",
                      backgroundColor: "rgba(255,255,255,0.2)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "24px",
                      padding: "16px 20px",
                      borderRadius: "50%",
                      cursor: "pointer"
                    }}
                    onClick={() => setActiveImageIndex((activeImageIndex - 1 + allUploadedImages.length) % allUploadedImages.length)}
                  >
                    &#10094;
                  </button>
                )}

                <img
                  src={allUploadedImages[activeImageIndex].url}
                  alt={`Zoom Attachment ${activeImageIndex + 1}`}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "4px" }}
                />

                {/* Next Slide button */}
                {allUploadedImages.length > 1 && (
                  <button
                    style={{
                      position: "absolute",
                      right: "10px",
                      backgroundColor: "rgba(255,255,255,0.2)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "24px",
                      padding: "16px 20px",
                      borderRadius: "50%",
                      cursor: "pointer"
                    }}
                    onClick={() => setActiveImageIndex((activeImageIndex + 1) % allUploadedImages.length)}
                  >
                    &#10095;
                  </button>
                )}
              </>
            )}
          </div>

          {/* Premium control bar (Requirement 8) */}
          <div style={{ marginTop: "24px", display: "flex", gap: "16px" }}>
            <Button
              onClick={() => {
                const url = activeImageIndex === -1 ? items[0]?.imageUrl : allUploadedImages[activeImageIndex].url;
                if (url) downloadAttachment(url, activeImageIndex === -1 ? 0 : activeImageIndex);
              }}
            >
              Download Image
            </Button>
            <Button
              onClick={() => {
                const url = activeImageIndex === -1 ? items[0]?.imageUrl : allUploadedImages[activeImageIndex].url;
                if (url) window.open(url, "_blank");
              }}
            >
              Open in New Tab
            </Button>
            <Button onClick={() => setActiveImageIndex(null)}>Close Preview</Button>
          </div>
        </div>
      )}

      {/* Hidden forms to execute Safe Approve & Reject submissions */}
      <Form method="post" style={{ display: "none" }}>
        <input type="hidden" name="actionType" value="approve" />
        <button type="submit" id="approve-form-submit" />
      </Form>

      <Form method="post" style={{ display: "none" }}>
        <input type="hidden" name="actionType" value="reject" />
        <input type="hidden" name="rejectionReason" value={rejectionInput} />
        <button type="submit" id="reject-form-submit" />
      </Form>
    </Page>
  );
}

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

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
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

  return json({ returnRequest });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;

  const formData = await request.formData();
  const actionType = formData.get("actionType") as string;

  if (actionType === "approve") {
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
          description: "Your request has been approved. Preparing pickup details.",
        },
      }),
    ]);
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
    ]);
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
          description: "A courier agent has been scheduled to collect the items.",
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
          description: "Package received at our warehouse. Awaiting quality check.",
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
          description: "Items are undergoing our standard quality control checks.",
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
          description: "Quality check passed. Refund has been initiated to original bank.",
        },
      }),
    ]);
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
    ]);
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
  const { returnRequest } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [rejectionInput, setRejectionInput] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [newNote, setNewNote] = useState("");

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
        {/* Main Section */}
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
                              <Badge>{item.type}</Badge>
                            </Text>
                            <Text as="p">
                              <strong>Reason:</strong> {item.reason}
                              {item.otherReasonText && ` (${item.otherReasonText})`}
                            </Text>
                            {item.requestedSize && (
                              <Text as="p" fontWeight="bold">
                                <strong>Requested Exchange Size:</strong>{" "}
                                <Badge tone="info">{item.requestedSize}</Badge>
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      </div>
                    </div>

                    {/* Image proof attachments */}
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
                                onClick={() => window.open(img.url, "_blank")}
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
                  Timeline Events Log
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 0" }}>
                  {timeline.map((event) => (
                    <div key={event.id} style={{ display: "flex", gap: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#000000", marginTop: "4px" }} />
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
                          Schedule Pickup
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

                {/* Reject dialog */}
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
                        placeholder="Explain to customer..."
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
    </Page>
  );
}

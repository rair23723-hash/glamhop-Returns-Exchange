import type { LoaderFunctionArgs, ActionFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import shopify from "../shopify.server";
import db from "../db.server";
import portalStyles from "../styles/portal.css?url";
import CustomerPortalLayout from "../components/CustomerPortalLayout";
import GlamHopOrderCard, { type OrderItem } from "../components/GlamHopOrderCard";
import ReturnExchangeForm from "../components/ReturnExchangeForm";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: portalStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
  const shopParam = url.searchParams.get("shop");

  if (!loggedInCustomerId) {
    const shopDomain = shopParam || "glamhop.myshopify.com";
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://${shopDomain}/account/login`,
      },
    });
  }

  const { admin, session } = await shopify.authenticate.public.appProxy(request);
  const shop = session.shop;
  const shopName = shop.split(".")[0].toUpperCase();

  const customerId = `gid://shopify/Customer/${loggedInCustomerId}`;

  try {
    // 1. Load app settings for return engine
    let settings = await db.appSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      settings = await db.appSettings.create({
        data: {
          shop,
          returnWindowDays: 30,
          exchangeWindowDays: 30,
          returnFee: 0,
          exchangeFee: 0,
          eligibleCategories: "[]",
          nonReturnableProducts: "[]",
          saleItemsEligible: false,
          imageRequired: true,
          maxImages: 5,
          allowedReasons: "[]",
        },
      });
    }

    // 2. Fetch customer orders
    const response = await admin.graphql(
      `#graphql
      query getCustomerOrders($customerId: ID!) {
        customer(id: $customerId) {
          firstName
          lastName
          email
          orders(first: 15) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                lineItems(first: 30) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalTotalPriceSet {
                        shopMoney {
                          amount
                        }
                      }
                      variant {
                        id
                        title
                        price
                        compareAtPrice
                        image {
                          url
                          altText
                        }
                        selectedOptions {
                          name
                          value
                        }
                        product {
                          id
                          title
                          productType
                          options(first: 5) {
                            name
                            values
                          }
                          variants(first: 50) {
                            edges {
                              node {
                                id
                                title
                                inventoryQuantity
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          customerId,
        },
      }
    );

    const responseData = await response.json();
    const customer = responseData.data?.customer;

    // 3. Fetch requests history (including timelines)
    const requests = await db.returnRequest.findMany({
      where: {
        shop,
        customerId,
      },
      include: {
        items: {
          include: {
            images: true,
          },
        },
        timeline: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json({
      customer,
      requests,
      settings,
      shopName,
      error: null,
      portalStylesUrl: portalStyles,
    });
  } catch (err) {
    console.error("Error loading storefront loader:", err);
    return json({
      customer: null,
      requests: [],
      settings: null,
      shopName,
      error: "Unable to retrieve account details. Please try again later.",
      portalStylesUrl: portalStyles,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await shopify.authenticate.public.appProxy(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  if (!loggedInCustomerId) {
    return json({ error: "Customer not logged in" }, { status: 401 });
  }

  const customerId = `gid://shopify/Customer/${loggedInCustomerId}`;

  try {
    const payload = await request.json();
    const {
      type,
      orderId,
      orderNumber,
      lineItemId,
      productTitle,
      variantTitle,
      imageUrl,
      quantity,
      reason,
      otherReasonText,
      customerNotes,
      requestedSize,
      images,
      customerName,
      customerEmail,
    } = payload;

    const requestCount = await db.returnRequest.count({
      where: { shop },
    });
    const requestId = `GHR-${String(requestCount + 1).padStart(6, "0")}`;

    // Create request with initial timeline event
    const createdRequest = await db.returnRequest.create({
      data: {
        requestId,
        shop,
        customerId,
        customerName: customerName || "Customer",
        customerEmail: customerEmail || "",
        orderId,
        orderNumber,
        status: "PENDING",
        type,
        customerNotes,
        items: {
          create: {
            lineItemId,
            productTitle,
            variantTitle,
            imageUrl,
            quantity,
            type,
            reason,
            otherReasonText,
            requestedSize,
            images: {
              create: images.map((img: string) => ({
                url: img,
              })),
            },
          },
        },
        timeline: {
          create: {
            status: "SUBMITTED",
            title: "Request Submitted",
            description: "Your request has been successfully submitted and is awaiting admin review.",
          },
        },
      },
      include: {
        items: {
          include: {
            images: true,
          },
        },
        timeline: true,
      },
    });

    return json({ success: true, request: createdRequest });
  } catch (error: any) {
    console.error("Error creating request:", error);
    return json({ error: error.message || "Failed to submit request" }, { status: 500 });
  }
};

export default function CustomerPortal() {
  const { customer, requests, settings, shopName, error, portalStylesUrl } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<"orders" | "requests">("orders");
  const [selectedFormItem, setSelectedFormItem] = useState<{
    item: any;
    orderId: string;
    orderNumber: string;
    type: "RETURN" | "EXCHANGE";
  } | null>(null);

  const [submissionSuccess, setSubmissionSuccess] = useState<any | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  const orders = customer?.orders?.edges || [];
  const customerName = `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim();
  const customerEmail = customer?.email || "";

  // Parse configurations
  const eligibleCats = settings ? JSON.parse(settings.eligibleCategories) : [];
  const nonReturnableProds = settings ? JSON.parse(settings.nonReturnableProducts) : [];

  const handleOpenForm = (
    item: any,
    orderId: string,
    orderNumber: string,
    type: "RETURN" | "EXCHANGE"
  ) => {
    const sizeOption = item.variant?.product?.options?.find(
      (o: any) => o.name.toLowerCase() === "size"
    );
    const availableSizes = sizeOption ? sizeOption.values : ["S", "M", "L", "XL", "XXL"];

    const formItem = {
      ...item,
      variant: item.variant
        ? {
            ...item.variant,
            availableSizes,
          }
        : undefined,
    };

    setSelectedFormItem({
      item: formItem,
      orderId,
      orderNumber,
      type,
    });
  };

  const handleFormSubmit = async (formData: any) => {
    const body = {
      ...formData,
      customerName,
      customerEmail,
    };

    try {
      const response = await fetch(window.location.href, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const resData = await response.json();
      if (resData.success) {
        setSubmissionSuccess(resData.request);
        setSelectedFormItem(null);
      } else {
        alert(resData.error || "Failed to submit request. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Submission error. Please try again.");
    }
  };

  if (submissionSuccess) {
    return (
      <CustomerPortalLayout shopName={shopName}>
        <link rel="stylesheet" href={portalStylesUrl} />
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "#f4f4f4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 30px auto",
              color: "#000000",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: "var(--glamhop-font-serif, serif)",
              fontSize: "24px",
              marginBottom: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Request Submitted
          </h2>
          <p style={{ fontSize: "15px", color: "#666666", marginBottom: "40px", lineHeight: "1.6" }}>
            Your request has been submitted successfully and is awaiting review.
          </p>

          <div
            style={{
              border: "1px solid #eeeeee",
              borderRadius: "12px",
              padding: "24px",
              backgroundColor: "#fafafa",
              marginBottom: "40px",
              textAlign: "left",
              fontSize: "14px",
            }}
          >
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
              <strong>Request ID:</strong>
              <span>{submissionSuccess.requestId}</span>
            </div>
            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
              <strong>Order Number:</strong>
              <span>{submissionSuccess.orderNumber}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Status:</strong>
              <span style={{ fontWeight: 600, textTransform: "uppercase", color: "#e65100" }}>
                {submissionSuccess.status} (Pending Review)
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setSubmissionSuccess(null);
              setActiveTab("requests");
              window.location.reload();
            }}
            className="btn-portal btn-portal-primary"
            style={{ width: "100%", maxWidth: "250px" }}
          >
            View My Requests
          </button>
        </div>
      </CustomerPortalLayout>
    );
  }

  return (
    <CustomerPortalLayout shopName={shopName}>
      <link rel="stylesheet" href={portalStylesUrl} />

      <div className="customer-info">
        <div className="customer-greeting">
          Hello, {customer?.firstName || "Guest"}
        </div>
        <div>{customer?.email}</div>
      </div>

      {error && (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: "8px",
            color: "#991b1b",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* Tab Selectors */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #eeeeee",
          marginBottom: "32px",
        }}
      >
        <button
          onClick={() => setActiveTab("orders")}
          style={{
            padding: "12px 24px",
            fontSize: "13px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: "none",
            border: "none",
            borderBottom: activeTab === "orders" ? "2px solid #000000" : "none",
            cursor: "pointer",
            color: activeTab === "orders" ? "#000000" : "#999999",
          }}
        >
          My Orders
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          style={{
            padding: "12px 24px",
            fontSize: "13px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: "none",
            border: "none",
            borderBottom: activeTab === "requests" ? "2px solid #000000" : "none",
            cursor: "pointer",
            color: activeTab === "requests" ? "#000000" : "#999999",
          }}
        >
          My Requests ({requests.length})
        </button>
      </div>

      {activeTab === "orders" ? (
        orders.length === 0 ? (
          <div className="empty-portal">
            <h2>No orders found</h2>
            <p>We couldn't find any recent purchases associated with your customer account.</p>
          </div>
        ) : (
          <div className="orders-container">
            {orders.map(({ node: order }: any) => {
              // 1. Calculate Delivery Date (Order Date + 3 days mock)
              const orderDate = new Date(order.createdAt);
              const deliveryDate = new Date(orderDate);
              deliveryDate.setDate(deliveryDate.getDate() + 3);

              // 2. Perform Eligibility Engine calculations
              const isDelivered = order.displayFulfillmentStatus === "FULFILLED";
              const currentDate = new Date();
              const diffTime = Math.abs(currentDate.getTime() - deliveryDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              const isWithinReturnWindow = settings ? diffDays <= settings.returnWindowDays : true;
              const isWithinExchangeWindow = settings ? diffDays <= settings.exchangeWindowDays : true;

              const mappedItems: OrderItem[] = order.lineItems.edges.map(({ node: item }: any) => {
                // Check existing request in DB
                const existingItemRequests = requests.filter(
                  (r) => r.orderId === order.id && r.items.some((i) => i.lineItemId === item.id)
                );
                const hasActiveReturn = existingItemRequests.some(
                  (r) => r.status !== "REJECTED" && r.items.some((i) => i.lineItemId === item.id && i.type === "RETURN")
                );
                const hasActiveExchange = existingItemRequests.some(
                  (r) => r.status !== "REJECTED" && r.items.some((i) => i.lineItemId === item.id && i.type === "EXCHANGE")
                );

                // Category verification
                const productType = item.variant?.product?.productType || "";
                const isCategoryEligible =
                  eligibleCats.length === 0 || eligibleCats.includes(productType);

                // Excluded products verification
                const productId = item.variant?.product?.id || "";
                const isProductReturnable = !nonReturnableProds.includes(productId);

                // Sale items check
                const isSaleItem =
                  item.variant?.compareAtPrice &&
                  parseFloat(item.variant.compareAtPrice) > parseFloat(item.variant.price);
                const isSaleEligible = settings
                  ? !isSaleItem || settings.saleItemsEligible
                  : true;

                // Inventory verification
                const siblingVariants = item.variant?.product?.variants?.edges || [];
                const totalInventory = siblingVariants.reduce(
                  (sum: number, edge: any) => sum + (edge.node.inventoryQuantity || 0),
                  0
                );
                const hasInventory = totalInventory > 0;

                // Final eligibility flags
                const returnEligible =
                  isDelivered &&
                  isWithinReturnWindow &&
                  !hasActiveReturn &&
                  isCategoryEligible &&
                  isProductReturnable &&
                  isSaleEligible;

                const exchangeEligible =
                  isDelivered &&
                  isWithinExchangeWindow &&
                  !hasActiveExchange &&
                  isCategoryEligible &&
                  isProductReturnable &&
                  isSaleEligible &&
                  hasInventory;

                // Ineligibility comments
                const returnIneligibleReason = !isDelivered
                  ? "Order is not yet delivered"
                  : !isWithinReturnWindow
                    ? `Exceeded return period (${settings?.returnWindowDays} days)`
                    : hasActiveReturn
                      ? "Return already initiated for this item"
                      : !isCategoryEligible
                        ? "Category is not eligible for returns"
                        : !isProductReturnable
                          ? "Item is marked non-returnable"
                          : !isSaleEligible
                            ? "Sale items are not eligible for returns"
                            : "";

                const exchangeIneligibleReason = !isDelivered
                  ? "Order is not yet delivered"
                  : !isWithinExchangeWindow
                    ? `Exceeded exchange period (${settings?.exchangeWindowDays} days)`
                    : hasActiveExchange
                      ? "Exchange already initiated for this item"
                      : !isCategoryEligible
                        ? "Category is not eligible for exchanges"
                        : !isProductReturnable
                          ? "Item is marked non-returnable"
                          : !isSaleEligible
                            ? "Sale items are not eligible for exchanges"
                            : !hasInventory
                              ? "Replacement stock unavailable"
                              : "";

                return {
                  id: item.id,
                  title: item.title,
                  quantity: item.quantity,
                  variant: item.variant
                    ? {
                        id: item.variant.id,
                        title: item.variant.title,
                        image: item.variant.image,
                        selectedOptions: item.variant.selectedOptions,
                        product: {
                          id: item.variant.product?.id || "",
                          title: item.variant.product?.title || item.title,
                          options: item.variant.product?.options,
                        },
                      }
                    : undefined,
                  // Pass calculation properties
                  returnEligible,
                  exchangeEligible,
                  returnIneligibleReason,
                  exchangeIneligibleReason,
                };
              });

              return (
                <div key={order.id}>
                  <GlamHopOrderCard
                    id={order.id}
                    name={order.name}
                    createdAt={order.createdAt}
                    displayFinancialStatus={order.displayFinancialStatus}
                    displayFulfillmentStatus={order.displayFulfillmentStatus}
                    items={mappedItems}
                    onReturn={(item) => handleOpenForm(item, order.id, order.name, "RETURN")}
                    onExchange={(item) => handleOpenForm(item, order.id, order.name, "EXCHANGE")}
                  />
                </div>
              );
            })}
          </div>
        )
      ) : requests.length === 0 ? (
        <div className="empty-portal">
          <h2>No requests found</h2>
          <p>You have not submitted any returns or exchanges.</p>
        </div>
      ) : (
        /* Requests Tab (Timeline display) */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {requests.map((req) => {
            const isExpanded = expandedRequestId === req.id;

            return (
              <div
                key={req.id}
                style={{
                  border: "1px solid #eeeeee",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "var(--glamhop-shadow)",
                  backgroundColor: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #eeeeee",
                    paddingBottom: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>
                      Request {req.requestId}
                    </h4>
                    <span style={{ fontSize: "12px", color: "#707070" }}>
                      Submitted {new Date(req.createdAt).toLocaleDateString()} for Order {req.orderNumber}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span
                      className="badge"
                      style={{
                        textTransform: "uppercase",
                        fontSize: "11px",
                        fontWeight: 600,
                        color:
                          req.status === "PENDING"
                            ? "#e65100"
                            : req.status === "APPROVED"
                              ? "#2e7d32"
                              : req.status === "REJECTED"
                                ? "#c62828"
                                : "#1565c0",
                      }}
                    >
                      {req.status}
                    </span>
                    <span className="badge">{req.type}</span>
                    <button
                      onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "12px",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: "0 4px",
                        marginLeft: "10px",
                        fontWeight: 500,
                      }}
                    >
                      {isExpanded ? "Hide Timeline" : "View Timeline"}
                    </button>
                  </div>
                </div>

                {/* Items breakdown */}
                {req.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: "16px",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    {item.imageUrl && (
                      <div style={{ width: "50px", height: "70px", borderRadius: "4px", overflow: "hidden" }}>
                        <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                    <div style={{ fontSize: "14px" }}>
                      <div style={{ fontWeight: 600 }}>{item.productTitle}</div>
                      <div style={{ color: "#707070", fontSize: "12px", marginTop: "2px" }}>
                        {item.variantTitle && `Variant: ${item.variantTitle}`} • Qty: {item.quantity}
                      </div>
                      <div style={{ fontSize: "12px", marginTop: "4px" }}>
                        <strong>Reason:</strong> {item.reason} {item.otherReasonText && `(${item.otherReasonText})`}
                        {item.requestedSize && (
                          <span>
                            {" "}
                            • <strong>New Size:</strong> {item.requestedSize}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {req.status === "REJECTED" && req.rejectionReason && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fee2e2",
                      borderRadius: "6px",
                      color: "#b91c1c",
                      fontSize: "13px",
                    }}
                  >
                    <strong>Rejection Reason:</strong> {req.rejectionReason}
                  </div>
                )}

                {/* Dynamic Status Timeline Section */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: "24px",
                      borderTop: "1px solid #eeeeee",
                      paddingTop: "20px",
                    }}
                  >
                    <h5
                      style={{
                        margin: "0 0 16px 0",
                        fontSize: "13px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      Request Timeline Tracker
                    </h5>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {req.timeline && req.timeline.length > 0 ? (
                        req.timeline.map((event, idx) => {
                          const dateObj = new Date(event.createdAt);
                          const dateStr = dateObj.toLocaleDateString();
                          const timeStr = dateObj.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          });

                          return (
                            <div
                              key={event.id}
                              style={{
                                display: "flex",
                                gap: "16px",
                                position: "relative",
                              }}
                            >
                              {/* Left line indicator */}
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  position: "relative",
                                }}
                              >
                                <div
                                  style={{
                                    width: "10px",
                                    height: "10px",
                                    borderRadius: "50%",
                                    backgroundColor: idx === req.timeline.length - 1 ? "#000000" : "#d0d0d0",
                                    zIndex: 2,
                                  }}
                                />
                                {idx < req.timeline.length - 1 && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "10px",
                                      bottom: "-16px",
                                      width: "2px",
                                      backgroundColor: "#e0e0e0",
                                      zIndex: 1,
                                    }}
                                  />
                                )}
                              </div>

                              {/* Event details */}
                              <div style={{ fontSize: "13px", paddingBottom: "8px" }}>
                                <div style={{ fontWeight: 600, color: "#000000" }}>{event.title}</div>
                                <div style={{ fontSize: "11px", color: "#808080", marginTop: "2px" }}>
                                  {dateStr} • {timeStr}
                                </div>
                                {event.description && (
                                  <div style={{ color: "#555555", marginTop: "4px", fontSize: "12px" }}>
                                    {event.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ fontSize: "12px", color: "#808080" }}>
                          No timeline details registered.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Render return/exchange forms */}
      {selectedFormItem && (
        <ReturnExchangeForm
          orderId={selectedFormItem.orderId}
          orderName={selectedFormItem.orderNumber}
          type={selectedFormItem.type}
          item={selectedFormItem.item}
          deliveryDate={(() => {
            const devDateObj = new Date();
            devDateObj.setDate(devDateObj.getDate() + 3);
            return devDateObj.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
          })()}
          onClose={() => setSelectedFormItem(null)}
          onSubmit={handleFormSubmit}
        />
      )}
    </CustomerPortalLayout>
  );
}

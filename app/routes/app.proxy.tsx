import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
  const shopParam = url.searchParams.get("shop");

  // 1. Force native storefront login redirect if not authenticated
  if (!loggedInCustomerId) {
    const redirectUrl = "/account/login?checkout_url=/apps/returns";
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
      },
    });
  }

  // 2. Validate App Proxy signed request
  const { admin, session } = await shopify.authenticate.public.appProxy(request);
  if (!session) {
    return new Response("Unauthorized Proxy Signature", { status: 401 });
  }

  if (!admin) {
    return new Response("Shopify API Client Uninitialized", { status: 500 });
  }

  const shop = session.shop;
  const customerId = `gid://shopify/Customer/${loggedInCustomerId}`;

  try {
    // 3. Load Return Policy Settings
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
          allowedReasons: JSON.stringify([
            "Wrong Size",
            "Wrong Product",
            "Damaged Product",
            "Defective Product",
            "Quality Issue",
            "Product Not As Expected",
            "Changed Mind",
            "Other",
          ]),
        },
      });
    }

    const eligibleCats = JSON.parse(settings.eligibleCategories);
    const nonReturnableProds = JSON.parse(settings.nonReturnableProducts);
    const allowedReasonsList = JSON.parse(settings.allowedReasons);

    // 4. Query Customer Profile & Orders
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
                      variant {
                        id
                        title
                        price
                        compareAtPrice
                        image {
                          url
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
        variables: { customerId },
      }
    );

    const responseData = await response.json();
    const customer = responseData.data?.customer;

    // 5. Query Existing Requests and timelines
    const dbRequests = await db.returnRequest.findMany({
      where: { shop, customerId },
      include: {
        items: {
          include: { images: true },
        },
        timeline: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 6. Pre-render Orders List HTML on Server Side
    let ordersHtml = "";
    const orders = customer?.orders?.edges || [];

    if (orders.length === 0) {
      ordersHtml = `
        <div class="glamhop-empty-state">
          <p>We couldn't find any recent purchases associated with your account.</p>
        </div>
      `;
    } else {
      orders.forEach(({ node: order }: any) => {
        const orderDate = new Date(order.createdAt);
        const deliveryDate = new Date(orderDate);
        deliveryDate.setDate(deliveryDate.getDate() + 3);
        const formattedDate = orderDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const isDelivered = order.displayFulfillmentStatus === "FULFILLED";
        const currentDate = new Date();
        const diffTime = Math.abs(currentDate.getTime() - deliveryDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const isWithinReturnWindow = diffDays <= settings!.returnWindowDays;
        const isWithinExchangeWindow = diffDays <= settings!.exchangeWindowDays;

        let itemsHtml = "";

        order.lineItems.edges.forEach(({ node: item }: any) => {
          // Calculate eligibility
          const existingItemRequests = dbRequests.filter(
            (r: any) => r.orderId === order.id && r.items.some((i: any) => i.lineItemId === item.id)
          );
          const hasActiveReturn = existingItemRequests.some(
            (r: any) => r.status !== "REJECTED" && r.items.some((i: any) => i.lineItemId === item.id && i.type === "RETURN")
          );
          const hasActiveExchange = existingItemRequests.some(
            (r: any) => r.status !== "REJECTED" && r.items.some((i: any) => i.lineItemId === item.id && i.type === "EXCHANGE")
          );

          const productType = item.variant?.product?.productType || "";
          const isCategoryEligible = eligibleCats.length === 0 || eligibleCats.includes(productType);
          const productId = item.variant?.product?.id || "";
          const isProductReturnable = !nonReturnableProds.includes(productId);

          const isSaleItem = item.variant?.compareAtPrice && parseFloat(item.variant.compareAtPrice) > parseFloat(item.variant.price);
          const isSaleEligible = !isSaleItem || settings!.saleItemsEligible;

          const siblingVariants = item.variant?.product?.variants?.edges || [];
          const totalInventory = siblingVariants.reduce((sum: number, edge: any) => sum + (edge.node.inventoryQuantity || 0), 0);
          const hasInventory = totalInventory > 0;

          const returnEligible = isDelivered && isWithinReturnWindow && !hasActiveReturn && isCategoryEligible && isProductReturnable && isSaleEligible;
          const exchangeEligible = isDelivered && isWithinExchangeWindow && !hasActiveExchange && isCategoryEligible && isProductReturnable && isSaleEligible && hasInventory;

          const returnIneligibleReason = !isDelivered
            ? "Order is not yet delivered"
            : !isWithinReturnWindow
              ? `Exceeded return window (${settings!.returnWindowDays} days)`
              : hasActiveReturn
                ? "Return already initiated"
                : !isCategoryEligible
                  ? "Category ineligible"
                  : !isProductReturnable
                    ? "Item marked non-returnable"
                    : !isSaleEligible
                      ? "Sale items ineligible"
                      : "";

          const exchangeIneligibleReason = !isDelivered
            ? "Order is not yet delivered"
            : !isWithinExchangeWindow
              ? `Exceeded exchange window (${settings!.exchangeWindowDays} days)`
              : hasActiveExchange
                ? "Exchange already initiated"
                : !isCategoryEligible
                  ? "Category ineligible"
                  : !isProductReturnable
                    ? "Item marked non-returnable"
                    : !isSaleEligible
                      ? "Sale items ineligible"
                      : !hasInventory
                        ? "Out of stock"
                        : "";

          const imageUrl = item.variant?.image?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png";

          // Extract size variants for swapping
          const sizeOption = item.variant?.product?.options?.find((o: any) => o.name.toLowerCase() === "size");
          const sizes = sizeOption ? sizeOption.values : ["S", "M", "L", "XL"];

          itemsHtml += `
            <div class="glamhop-item-row" data-item-id="${item.id}">
              <img class="glamhop-item-img" src="${imageUrl}" alt="" />
              <div class="glamhop-item-details">
                <div class="glamhop-item-title">${item.title}</div>
                <div class="glamhop-item-meta">
                  <span>Variant: ${item.variant?.title || "Default"}</span> • 
                  <span>Quantity: ${item.quantity}</span>
                </div>
                
                <div class="glamhop-item-actions">
                  ${returnEligible ? `
                    <button class="glamhop-btn-action glamhop-btn-primary" onclick="openPortalForm('${order.id}', '${order.name}', '${item.id}', '${item.title.replace(/'/g, "\\'")}', '${item.variant?.title.replace(/'/g, "\\'")}', '${imageUrl}', ${item.quantity}, 'RETURN', '${sizes.join(",")}')">Return</button>
                  ` : `
                    <span class="glamhop-ineligible-tag">Return Blocked: ${returnIneligibleReason}</span>
                  `}

                  ${exchangeEligible ? `
                    <button class="glamhop-btn-action glamhop-btn-secondary" onclick="openPortalForm('${order.id}', '${order.name}', '${item.id}', '${item.title.replace(/'/g, "\\'")}', '${item.variant?.title.replace(/'/g, "\\'")}', '${imageUrl}', ${item.quantity}, 'EXCHANGE', '${sizes.join(",")}')">Exchange</button>
                  ` : `
                    <span class="glamhop-ineligible-tag">Exchange Blocked: ${exchangeIneligibleReason}</span>
                  `}
                </div>
              </div>
            </div>
          `;
        });

        ordersHtml += `
          <div class="glamhop-order-card">
            <div class="glamhop-order-header">
              <div>
                <h3 class="glamhop-order-id">Order ${order.name}</h3>
                <span class="glamhop-order-date">${formattedDate}</span>
              </div>
              <div class="glamhop-badges">
                <span class="glamhop-badge status-${order.displayFinancialStatus.toLowerCase()}">${order.displayFinancialStatus}</span>
                <span class="glamhop-badge status-${order.displayFulfillmentStatus.toLowerCase()}">${order.displayFulfillmentStatus}</span>
              </div>
            </div>
            <div class="glamhop-order-body">
              ${itemsHtml}
            </div>
          </div>
        `;
      });
    }

    // 7. Pre-render Requests History HTML
    let requestsHtml = "";
    if (dbRequests.length === 0) {
      requestsHtml = `
        <div class="glamhop-empty-state">
          <p>You have not submitted any returns or exchanges.</p>
        </div>
      `;
    } else {
      dbRequests.forEach((req: any) => {
        let itemsSummary = "";
        req.items.forEach((item: any) => {
          itemsSummary += `
            <div class="glamhop-hist-row">
              <img src="${item.imageUrl || ""}" style="width: 44px; height: 60px; object-fit: cover; border-radius: 4px;" />
              <div>
                <div style="font-weight:600;">${item.productTitle}</div>
                <div style="font-size:12px; color:#707070;">
                  Variant: ${item.variantTitle || "Default"} • Qty: ${item.quantity}
                </div>
                <div style="font-size:12px; margin-top:2px;">
                  <strong>Reason:</strong> ${item.reason} ${item.otherReasonText ? `(${item.otherReasonText})` : ""}
                  ${item.requestedSize ? ` • <strong>Exchange Size:</strong> ${item.requestedSize}` : ""}
                </div>
              </div>
            </div>
          `;
        });

        let timelineSteps = "";
        req.timeline.forEach((event: any, idx: number) => {
          const dt = new Date(event.createdAt);
          timelineSteps += `
            <div class="glamhop-time-step">
              <div class="glamhop-time-bullet" style="background-color: ${idx === req.timeline.length - 1 ? "#000000" : "#d0d0d0"}"></div>
              <div class="glamhop-time-content">
                <div class="glamhop-time-title">${event.title}</div>
                <div class="glamhop-time-meta">${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                ${event.description ? `<div class="glamhop-time-desc">${event.description}</div>` : ""}
              </div>
            </div>
          `;
        });

        requestsHtml += `
          <div class="glamhop-request-card">
            <div class="glamhop-req-header">
              <div>
                <h4>Request ${req.requestId}</h4>
                <span>For Order ${req.orderNumber} • ${new Date(req.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                <span class="glamhop-badge status-${req.status.toLowerCase()}">${req.status}</span>
                <span class="glamhop-badge">${req.type}</span>
              </div>
            </div>
            
            <div class="glamhop-req-items">
              ${itemsSummary}
            </div>

            ${req.rejectionReason ? `
              <div class="glamhop-rejection-box">
                <strong>Rejection Reason:</strong> ${req.rejectionReason}
              </div>
            ` : ""}

            <button class="glamhop-btn-toggle" onclick="toggleTimeline('${req.id}')">View Tracking Timeline</button>
            <div id="timeline-${req.id}" class="glamhop-timeline-wrapper" style="display:none;">
              <h5 style="margin: 0 0 16px 0; font-size:12px; text-transform:uppercase; letter-spacing:0.05em;">Status Progression Tracking</h5>
              <div class="glamhop-timeline-steps">
                ${timelineSteps}
              </div>
            </div>
          </div>
        `;
      });
    }

    // 8. Generate full liquid template to inject inside storefront layout
    const reasonsOptions = allowedReasonsList.map((r: string) => `<option value="${r}">${r}</option>`).join("");

    const liquidTemplate = `
      <style>
        .glamhop-portal-wrapper {
          max-width: 800px;
          margin: 40px auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #000000;
          padding: 0 20px;
        }
        .glamhop-portal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 1px solid #eeeeee;
          padding-bottom: 20px;
        }
        .glamhop-greeting {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .glamhop-tabs-bar {
          display: flex;
          border-bottom: 1px solid #eeeeee;
          margin-bottom: 30px;
          gap: 16px;
        }
        .glamhop-tab-btn {
          background: none;
          border: none;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #999999;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .glamhop-tab-btn.active {
          color: #000000;
          border-bottom-color: #000000;
        }
        .glamhop-order-card, .glamhop-request-card {
          border: 1px solid #eeeeee;
          border-radius: 12px;
          padding: 24px;
          background-color: #ffffff;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.01);
        }
        .glamhop-order-header, .glamhop-req-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #fafafa;
          padding-bottom: 16px;
          margin-bottom: 16px;
        }
        .glamhop-order-id, .glamhop-req-header h4 {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
        }
        .glamhop-order-date, .glamhop-req-header span {
          font-size: 12px;
          color: #707070;
        }
        .glamhop-badges {
          display: flex;
          gap: 8px;
        }
        .glamhop-badge {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 4px;
          background-color: #f4f4f4;
          color: #555555;
        }
        .glamhop-badge.status-fulfilled, .glamhop-badge.status-approved, .glamhop-badge.status-completed {
          background-color: #e8f5e9;
          color: #2e7d32;
        }
        .glamhop-badge.status-unfulfilled, .glamhop-badge.status-pending {
          background-color: #fff3e0;
          color: #e65100;
        }
        .glamhop-badge.status-rejected {
          background-color: #ffe5e5;
          color: #c62828;
        }
        .glamhop-item-row {
          display: flex;
          gap: 16px;
          padding: 16px 0;
          border-bottom: 1px solid #fafafa;
        }
        .glamhop-item-row:last-child {
          border-bottom: none;
        }
        .glamhop-item-img {
          width: 70px;
          height: 95px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid #f0f0f0;
        }
        .glamhop-item-details {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .glamhop-item-title {
          font-size: 14px;
          font-weight: 600;
        }
        .glamhop-item-meta {
          font-size: 12px;
          color: #707070;
          margin-top: 4px;
        }
        .glamhop-item-actions {
          display: flex;
          gap: 12px;
          margin-top: 12px;
        }
        .glamhop-btn-action {
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid #000000;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          transition: all 0.2s;
        }
        .glamhop-btn-primary {
          background-color: #000000;
          color: #ffffff;
        }
        .glamhop-btn-secondary {
          background-color: #ffffff;
          color: #000000;
        }
        .glamhop-ineligible-tag {
          font-size: 11px;
          color: #999999;
          background-color: #fafafa;
          padding: 6px 12px;
          border-radius: 4px;
          border: 1px dashed #dddddd;
        }
        .glamhop-empty-state {
          text-align: center;
          padding: 60px 20px;
          border: 1px dashed #dddddd;
          border-radius: 12px;
          color: #666666;
        }
        
        /* Modal Backdrop */
        .glamhop-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0,0,0,0.4);
          z-index: 10000;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .glamhop-modal {
          background-color: #ffffff;
          border-radius: 16px;
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 30px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .glamhop-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eeeeee;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .glamhop-modal-title {
          font-size: 18px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .glamhop-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
        }
        .glamhop-form-group {
          margin-bottom: 20px;
        }
        .glamhop-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .glamhop-select, .glamhop-textarea {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #cccccc;
          border-radius: 6px;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
        }
        .glamhop-textarea {
          resize: vertical;
          height: 80px;
        }
        .glamhop-file-uploader {
          border: 1px dashed #cccccc;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          background-color: #fafafa;
        }
        .glamhop-image-previews {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .glamhop-preview-slot {
          width: 60px;
          height: 60px;
          border-radius: 4px;
          overflow: hidden;
          position: relative;
          border: 1px solid #eeeeee;
        }
        .glamhop-preview-slot img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .glamhop-checkbox-group {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-top: 20px;
          font-size: 13px;
          line-height: 1.4;
        }
        .glamhop-checkbox-group input {
          margin-top: 3px;
        }
        .glamhop-btn-toggle {
          background: none;
          border: none;
          color: #000000;
          text-decoration: underline;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          margin-top: 10px;
        }
        
        /* Timeline */
        .glamhop-timeline-wrapper {
          margin-top: 20px;
          border-top: 1px dashed #eeeeee;
          padding-top: 20px;
        }
        .glamhop-timeline-steps {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .glamhop-time-step {
          display: flex;
          gap: 16px;
          position: relative;
        }
        .glamhop-time-bullet {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #d0d0d0;
          margin-top: 4px;
          z-index: 2;
        }
        .glamhop-time-step:not(:last-child)::after {
          content: "";
          position: absolute;
          left: 4px;
          top: 14px;
          bottom: -16px;
          width: 2px;
          background-color: #eeeeee;
          z-index: 1;
        }
        .glamhop-time-content {
          font-size: 13px;
        }
        .glamhop-time-title {
          font-weight: 600;
        }
        .glamhop-time-meta {
          font-size: 11px;
          color: #808080;
          margin-top: 2px;
        }
        .glamhop-time-desc {
          color: #555555;
          margin-top: 4px;
          font-size: 12px;
        }
        .glamhop-rejection-box {
          background-color: #fff5f5;
          border: 1px solid #ffe3e3;
          border-radius: 6px;
          color: #c53030;
          font-size: 13px;
          padding: 12px;
          margin-bottom: 16px;
        }
      </style>

      <div class="glamhop-portal-wrapper">
        <div class="glamhop-portal-header">
          <div class="glamhop-greeting">Hello, ${customer?.firstName || "Guest"}</div>
          <div style="font-size:13px; color:#707070;">${customer?.email || ""}</div>
        </div>

        <div class="glamhop-tabs-bar">
          <button id="btn-tab-orders" class="glamhop-tab-btn active" onclick="switchPortalTab('orders')">My Orders</button>
          <button id="btn-tab-requests" class="glamhop-tab-btn" onclick="switchPortalTab('requests')">My Requests (${dbRequests.length})</button>
        </div>

        <!-- Orders Section -->
        <div id="section-orders">
          ${ordersHtml}
        </div>

        <!-- Requests Section -->
        <div id="section-requests" style="display:none;">
          ${requestsHtml}
        </div>
      </div>

      <!-- Action Form Dialog Modal -->
      <div id="glamhop-modal-form" class="glamhop-modal-backdrop">
        <div class="glamhop-modal">
          <div class="glamhop-modal-header">
            <h3 id="form-type-title" class="glamhop-modal-title">Initiate Return</h3>
            <button class="glamhop-modal-close" onclick="closePortalForm()">&times;</button>
          </div>
          
          <div style="display:flex; gap:16px; margin-bottom: 24px; border-bottom:1px solid #f9f9f9; padding-bottom:16px;">
            <img id="form-item-img" src="" style="width:50px; height:70px; object-fit:cover; border-radius:4px;" />
            <div>
              <h4 id="form-item-title" style="margin:0 0 4px 0; font-size:14px;"></h4>
              <span id="form-item-variant" style="font-size:12px; color:#707070;"></span>
            </div>
          </div>

          <form id="glamhop-submit-form" onsubmit="handlePortalFormSubmit(event)">
            <input type="hidden" id="field-type" name="type" />
            <input type="hidden" id="field-order-id" name="orderId" />
            <input type="hidden" id="field-order-name" name="orderNumber" />
            <input type="hidden" id="field-item-id" name="lineItemId" />
            <input type="hidden" id="field-item-title" name="productTitle" />
            <input type="hidden" id="field-item-variant" name="variantTitle" />
            <input type="hidden" id="field-item-img-url" name="imageUrl" />
            <input type="hidden" id="field-quantity" name="quantity" />

            <!-- Size exchange selector -->
            <div id="group-exchange-size" class="glamhop-form-group" style="display:none;">
              <label class="glamhop-label">Select Exchange Size</label>
              <select id="field-exchange-size" name="requestedSize" class="glamhop-select"></select>
            </div>

            <div class="glamhop-form-group">
              <label id="label-reason" class="glamhop-label">Reason for Return</label>
              <select id="field-reason" name="reason" class="glamhop-select" onchange="toggleOtherReasonField()">
                ${reasonsOptions}
              </select>
            </div>

            <div id="group-other-reason" class="glamhop-form-group" style="display:none;">
              <label class="glamhop-label">Describe your issue</label>
              <textarea id="field-other-reason" name="otherReasonText" class="glamhop-textarea" placeholder="Provide more details..."></textarea>
            </div>

            <div class="glamhop-form-group">
              <label class="glamhop-label">Upload Images (Maximum 5)</label>
              <div class="glamhop-file-uploader" onclick="triggerFileInput()">
                <span style="font-size:13px; color:#666666;">Click to upload JPG, PNG, WEBP proofs</span>
                <input type="file" id="field-files" multiple accept="image/png, image/jpeg, image/webp" style="display:none;" onchange="handleFileSelections(event)" />
              </div>
              <div id="image-previews-container" class="glamhop-image-previews"></div>
            </div>

            <div class="glamhop-checkbox-group">
              <input type="checkbox" id="field-confirm" required />
              <label for="field-confirm">I confirm this product is unused, unopened and follows the GlamHop Policy.</label>
            </div>

            <button type="submit" class="glamhop-btn-action glamhop-btn-primary" style="width:100%; margin-top:24px; padding:12px 0;">Submit Request</button>
          </form>
        </div>
      </div>

      <script type="text/javascript">
        let uploadedImagesBase64 = [];

        function switchPortalTab(tab) {
          document.getElementById('btn-tab-orders').classList.toggle('active', tab === 'orders');
          document.getElementById('btn-tab-requests').classList.toggle('active', tab === 'requests');
          
          document.getElementById('section-orders').style.display = (tab === 'orders') ? 'block' : 'none';
          document.getElementById('section-requests').style.display = (tab === 'requests') ? 'block' : 'none';
        }

        function toggleTimeline(reqId) {
          const block = document.getElementById('timeline-' + reqId);
          block.style.display = (block.style.display === 'none') ? 'block' : 'none';
        }

        function openPortalForm(orderId, orderName, itemId, title, variant, imgUrl, qty, type, sizesList) {
          uploadedImagesBase64 = [];
          document.getElementById('image-previews-container').innerHTML = '';
          document.getElementById('glamhop-submit-form').reset();

          // Set hidden values
          document.getElementById('field-type').value = type;
          document.getElementById('field-order-id').value = orderId;
          document.getElementById('field-order-name').value = orderName;
          document.getElementById('field-item-id').value = itemId;
          document.getElementById('field-item-title').value = title;
          document.getElementById('field-item-variant').value = variant;
          document.getElementById('field-item-img-url').value = imgUrl;
          document.getElementById('field-quantity').value = qty;

          // Update header layouts
          document.getElementById('form-type-title').innerText = type === 'RETURN' ? 'Initiate Return' : 'Initiate Exchange';
          document.getElementById('label-reason').innerText = type === 'RETURN' ? 'Reason for Return' : 'Reason for Exchange';
          document.getElementById('form-item-img').src = imgUrl;
          document.getElementById('form-item-title').innerText = title;
          document.getElementById('form-item-variant').innerText = 'Variant: ' + variant;

          // Toggle exchange size group
          const sizeSelect = document.getElementById('field-exchange-size');
          const sizeGroup = document.getElementById('group-exchange-size');
          if (type === 'EXCHANGE' && sizesList) {
            sizeSelect.innerHTML = '';
            sizesList.split(',').forEach(sz => {
              sizeSelect.innerHTML += '<option value="' + sz + '">' + sz + '</option>';
            });
            sizeGroup.style.display = 'block';
          } else {
            sizeGroup.style.display = 'none';
          }

          document.getElementById('group-other-reason').style.display = 'none';
          document.getElementById('glamhop-modal-form').style.display = 'flex';
        }

        function closePortalForm() {
          document.getElementById('glamhop-modal-form').style.display = 'none';
        }

        function toggleOtherReasonField() {
          const val = document.getElementById('field-reason').value;
          document.getElementById('group-other-reason').style.display = (val.toLowerCase() === 'other') ? 'block' : 'none';
        }

        function triggerFileInput() {
          document.getElementById('field-files').click();
        }

        function handleFileSelections(e) {
          const files = e.target.files;
          const container = document.getElementById('image-previews-container');
          
          const maxFiles = Math.min(files.length, 5 - uploadedImagesBase64.length);
          for (let i = 0; i < maxFiles; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = function(evt) {
              const base64 = evt.target.result;
              uploadedImagesBase64.push(base64);

              // Render preview slot
              container.innerHTML += '<div class="glamhop-preview-slot"><img src="' + base64 + '" /></div>';
            }
            reader.readAsDataURL(file);
          }
        }

        async function handlePortalFormSubmit(e) {
          e.preventDefault();
          
          const body = {
            type: document.getElementById('field-type').value,
            orderId: document.getElementById('field-order-id').value,
            orderNumber: document.getElementById('field-order-name').value,
            lineItemId: document.getElementById('field-item-id').value,
            productTitle: document.getElementById('field-item-title').value,
            variantTitle: document.getElementById('field-item-variant').value,
            imageUrl: document.getElementById('field-item-img-url').value,
            quantity: parseInt(document.getElementById('field-quantity').value, 10),
            reason: document.getElementById('field-reason').value,
            otherReasonText: document.getElementById('field-other-reason').value || "",
            requestedSize: document.getElementById('field-exchange-size')?.value || "",
            images: uploadedImagesBase64
          };

          try {
            const response = await fetch(window.location.href, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const res = await response.json();
            if (res.success) {
              alert('Request submitted successfully!');
              closePortalForm();
              window.location.reload();
            } else {
              alert(res.error || 'Failed to submit request.');
            }
          } catch(err) {
            console.error(err);
            alert('An error occurred during submission.');
          }
        }
      </script>
    `;

    return new Response(liquidTemplate, {
      headers: {
        "Content-Type": "application/liquid",
      },
    });
  } catch (err) {
    console.error("Error generating liquid template:", err);
    return new Response("<div style='padding:20px; color:red;'>An error occurred rendering returns portal.</div>", {
      headers: { "Content-Type": "application/liquid" },
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await shopify.authenticate.public.appProxy(request);
  if (!session) {
    return json({ error: "Session missing in request" }, { status: 400 });
  }
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

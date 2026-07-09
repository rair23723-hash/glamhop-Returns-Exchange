/* Responsive Luxury HTML Email Templates matching GlamHop Brand Guidelines */

export interface EmailTemplatePayload {
  requestId: string;
  customerName: string;
  orderNumber: string;
  productTitle: string;
  quantity: number;
  variantTitle?: string;
  rejectionReason?: string;
  refundAmount?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

const emailHeader = (title: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #ffffff;
      color: #000000;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #ffffff;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      border: 1px solid #eeeeee;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
      box-sizing: border-box;
    }
    .logo {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 26px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: center;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 12px;
      color: #707070;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 1px solid #eeeeee;
      padding-bottom: 24px;
    }
    .heading {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      line-height: 1.4;
      text-align: center;
    }
    .text {
      font-size: 14px;
      line-height: 1.6;
      color: #333333;
      margin-bottom: 24px;
    }
    .summary-card {
      border: 1px solid #eeeeee;
      border-radius: 8px;
      background-color: #fafafa;
      padding: 20px;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .summary-row:last-child {
      margin-bottom: 0;
    }
    .btn {
      display: block;
      width: 200px;
      margin: 30px auto 0 auto;
      padding: 14px 24px;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-radius: 4px;
    }
    .footer {
      margin-top: 48px;
      border-top: 1px solid #eeeeee;
      padding-top: 24px;
      text-align: center;
      font-size: 11px;
      color: #999999;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">GLAMHOP</div>
      <div class="subtitle">Returns & Exchange</div>
`;

const emailFooter = `
      <div class="footer">
        &copy; ${new Date().getFullYear()} GlamHop. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
`;

export const getReturnSubmittedTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Return Submitted")}
  <div class="heading">Return Request Received</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">We have received your return request for Order #${p.orderNumber}. Our team is reviewing the details and we will notify you once approved.</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    <div class="summary-row"><strong>Product:</strong> <span>${p.productTitle} ${p.variantTitle ? `(${p.variantTitle})` : ""}</span></div>
    <div class="summary-row"><strong>Quantity:</strong> <span>${p.quantity}</span></div>
    <div class="summary-row"><strong>Status:</strong> <span style="color:#e65100; font-weight:600;">PENDING REVIEW</span></div>
  </div>
  <p class="text">Thank you for shopping with us.</p>
  ${emailFooter}
`;

export const getExchangeSubmittedTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Exchange Submitted")}
  <div class="heading">Exchange Request Received</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">We have received your exchange request for Order #${p.orderNumber}. Our team is checking current inventory availability and will update you shortly.</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    <div class="summary-row"><strong>Product:</strong> <span>${p.productTitle} ${p.variantTitle ? `(${p.variantTitle})` : ""}</span></div>
    <div class="summary-row"><strong>Quantity:</strong> <span>${p.quantity}</span></div>
    <div class="summary-row"><strong>Status:</strong> <span style="color:#e65100; font-weight:600;">PENDING REVIEW</span></div>
  </div>
  <p class="text">We will process your exchange requests at the earliest.</p>
  ${emailFooter}
`;

export const getRequestApprovedTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Request Approved")}
  <div class="heading">Request Approved</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">Great news! Your request ${p.requestId} for Order #${p.orderNumber} has been approved. A pickup courier is being scheduled to retrieve the items.</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    <div class="summary-row"><strong>Status:</strong> <span style="color:#2e7d32; font-weight:600;">APPROVED</span></div>
  </div>
  <p class="text">Please ensure the items are packaged with tags intact before the pickup agent arrives.</p>
  ${emailFooter}
`;

export const getRequestRejectedTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Request Rejected")}
  <div class="heading">Request Update</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">Your request ${p.requestId} for Order #${p.orderNumber} could not be approved at this time.</p>
  <div class="summary-card" style="border-color: #fee2e2; background-color: #fef2f2; color: #991b1b;">
    <strong>Reason for Rejection:</strong><br>
    <span style="font-style: italic; display:block; margin-top: 8px;">${p.rejectionReason || "Does not comply with return policy rules."}</span>
  </div>
  <p class="text">If you have any questions or feel this is an error, please reach out to our customer experience team.</p>
  ${emailFooter}
`;

export const getRefundTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Refund Processed")}
  <div class="heading">Refund Processed</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">We have successfully processed your refund of <strong>${p.refundAmount || "the order value"}</strong> for request ${p.requestId}.</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    <div class="summary-row"><strong>Refund Status:</strong> <span style="color:#2e7d32; font-weight:600;">COMPLETED</span></div>
  </div>
  <p class="text">Funds will credit back to your original payment method within 5-7 business days depending on your bank.</p>
  ${emailFooter}
`;

export const getReplacementShipmentTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Replacement Dispatched")}
  <div class="heading">Replacement Dispatched</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">Your replacement items for request ${p.requestId} have been shipped and are on the way!</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    {p.trackingNumber && <div class="summary-row"><strong>Tracking Number:</strong> <span>${p.trackingNumber}</span></div>}
    <div class="summary-row"><strong>Status:</strong> <span style="color:#1565c0; font-weight:600;">SHIPPED</span></div>
  </div>
  ${p.trackingUrl ? `<a href="${p.trackingUrl}" class="btn">Track Order</a>` : ""}
  ${emailFooter}
`;

export const getRequestClosedTemplate = (p: EmailTemplatePayload) => `
  ${emailHeader("Request Closed")}
  <div class="heading">Request Closed</div>
  <p class="text">Hello ${p.customerName},</p>
  <p class="text">Your request ${p.requestId} for Order #${p.orderNumber} has been resolved and closed.</p>
  <div class="summary-card">
    <div class="summary-row"><strong>Request ID:</strong> <span>${p.requestId}</span></div>
    <div class="summary-row"><strong>Final Status:</strong> <span style="color:#707070; font-weight:600;">CLOSED</span></div>
  </div>
  <p class="text">We hope you loved your resolution. Thank you for choosing GlamHop.</p>
  ${emailFooter}
`;

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import shopify, { dbLog } from "../shopify.server";
import db from "../db.server";

// Loader: Renders the Customer Returns Portal via Shopify App Proxy
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await dbLog("PROXY_LOADER_START", request.url);

  try {
    const { session } = await shopify.authenticate.public.appProxy(request);
    if (!session) {
      await dbLog("PROXY_LOADER_UNAUTHORIZED", "No session found in appProxy context");
      return new Response("Unauthorized Proxy Signature", { status: 401 });
    }

    const shop = session.shop;

    // 1. Get or Create App Settings
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
          saleItemsEligible: true,
          imageRequired: true,
          maxImages: 6,
          allowedReasons: JSON.stringify([
            "Incorrect Size",
            "Wrong Item Sent",
            "Product Damaged On Arrival",
            "Color Mismatch",
            "Quality Unsatisfactory",
            "Changed My Mind",
            "Other",
          ]),
        },
      });
    }

    const reasonsList = JSON.parse(settings.allowedReasons);
    const reasonsOptions = reasonsList.map((r: string) => `<option value="${r}">${r}</option>`).join("");

    // 2. Render Elegant Returns & Exchange Portal UI
    const liquidTemplate = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        
        .glamhop-portal {
          max-width: 750px;
          margin: 40px auto;
          font-family: 'Inter', -apple-system, sans-serif;
          color: #1a1a1a;
          background: #ffffff;
          border: 1px solid #eaeaea;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.03);
          overflow: hidden;
        }

        .glamhop-header {
          background: #000000;
          color: #ffffff;
          padding: 40px 30px;
          text-align: center;
          border-bottom: 1px solid #222222;
        }

        .glamhop-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 32px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .glamhop-subtitle {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #a0a0a0;
        }

        .glamhop-body {
          padding: 40px 30px;
        }

        /* Verification Form View */
        .glamhop-view {
          display: none;
        }

        .glamhop-view.active {
          display: block;
        }

        .glamhop-view-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
          text-align: center;
          letter-spacing: -0.01em;
        }

        .glamhop-view-desc {
          font-size: 14px;
          color: #666666;
          margin-bottom: 30px;
          text-align: center;
          line-height: 1.5;
        }

        .glamhop-form-group {
          margin-bottom: 24px;
        }

        .glamhop-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #444444;
        }

        .glamhop-input, .glamhop-select, .glamhop-textarea {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .glamhop-input:focus, .glamhop-select:focus, .glamhop-textarea:focus {
          border-color: #000000;
        }

        .glamhop-btn {
          width: 100%;
          background: #000000;
          color: #ffffff;
          border: none;
          padding: 14px 20px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          transition: background 0.2s;
        }

        .glamhop-btn:hover {
          background: #222222;
        }

        .glamhop-btn-outline {
          background: #ffffff;
          color: #000000;
          border: 1px solid #000000;
          margin-top: 12px;
        }

        .glamhop-btn-outline:hover {
          background: #f9f9f9;
        }

        /* Order Details / Product Listing View */
        .glamhop-order-meta {
          background: #fafafa;
          border: 1px solid #eeeeee;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 30px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .glamhop-order-meta strong {
          color: #000000;
        }

        .glamhop-product-card {
          display: flex;
          gap: 20px;
          border: 1px solid #eeeeee;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          background: #ffffff;
          align-items: flex-start;
          transition: box-shadow 0.2s;
        }

        .glamhop-product-card:hover {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
        }

        .glamhop-prod-img {
          width: 80px;
          height: 110px;
          object-fit: cover;
          border-radius: 8px;
          border: 1px solid #f0f0f0;
          flex-shrink: 0;
        }

        .glamhop-prod-details {
          flex-grow: 1;
        }

        .glamhop-prod-title {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 6px 0;
        }

        .glamhop-prod-variant {
          font-size: 12px;
          color: #777777;
          margin-bottom: 12px;
        }

        .glamhop-prod-actions {
          display: flex;
          gap: 12px;
        }

        .glamhop-action-btn {
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid #000000;
          transition: all 0.2s;
        }

        .glamhop-btn-ret {
          background: #000000;
          color: #ffffff;
        }

        .glamhop-btn-exc {
          background: #ffffff;
          color: #000000;
        }

        .glamhop-ineligible {
          font-size: 12px;
          color: #999999;
          background: #fcfcfc;
          border: 1px dashed #dddddd;
          padding: 8px 12px;
          border-radius: 6px;
          display: inline-block;
        }

        /* Form Wizard Dialog Modal styling */
        .glamhop-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1000;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .glamhop-modal {
          background: #ffffff;
          border-radius: 16px;
          max-width: 520px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 30px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .glamhop-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eeeeee;
          padding-bottom: 16px;
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
          color: #888888;
        }

        /* Image Upload previews */
        .glamhop-uploader {
          border: 2px dashed #cccccc;
          border-radius: 8px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          background: #fafafa;
          transition: border-color 0.2s;
        }

        .glamhop-uploader:hover {
          border-color: #000000;
        }

        .glamhop-previews {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .glamhop-preview-item {
          width: 70px;
          height: 70px;
          border-radius: 6px;
          overflow: hidden;
          position: relative;
          border: 1px solid #eaeaea;
        }

        .glamhop-preview-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .glamhop-checkbox-container {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 13px;
          line-height: 1.4;
          color: #555555;
          margin-top: 24px;
        }

        .glamhop-checkbox-container input {
          margin-top: 2px;
        }

        /* Alert / Spinner Banner */
        .glamhop-alert {
          background: #ffebee;
          color: #c62828;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 24px;
          display: none;
        }

        .glamhop-spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 0;
        }

        .glamhop-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #000000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Success View styling */
        .glamhop-success-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: #e8f5e9;
          color: #2e7d32;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px auto;
        }
      </style>

      <div class="glamhop-portal">
        <div class="glamhop-header">
          <div class="glamhop-logo">GlamHop</div>
          <div class="glamhop-subtitle">Returns & Exchanges</div>
        </div>

        <div class="glamhop-body">
          <div id="glamhop-alert-box" class="glamhop-alert"></div>

          <!-- Step 1: Order Verification Lookup -->
          <div id="view-lookup" class="glamhop-view active">
            <h2 class="glamhop-view-title">Find Your Order</h2>
            <p class="glamhop-view-desc">Provide your Order Number OR Tracking ID (AWB) along with your Email Address or Phone Number to verify.</p>
            
            <form onsubmit="handleOrderLookup(event)">
              <div class="glamhop-form-group">
                <label class="glamhop-label">Order Number</label>
                <input type="text" id="lookup-order" class="glamhop-input" placeholder="e.g. #1001 (Optional if Tracking ID provided)" />
              </div>

              <div style="text-align: center; margin: 16px 0; font-size: 12px; color: #777777; font-weight: 600; letter-spacing: 0.1em;">— OR —</div>

              <div class="glamhop-form-group">
                <label class="glamhop-label">Tracking ID (AWB)</label>
                <input type="text" id="lookup-tracking" class="glamhop-input" placeholder="e.g. AWB12345678 (Optional if Order Number provided)" />
              </div>

              <div class="glamhop-form-group">
                <label class="glamhop-label">Email or Phone Number</label>
                <input type="text" id="lookup-email-phone" class="glamhop-input" placeholder="e.g. client@email.com or +1234567890" required />
              </div>

              <button type="submit" class="glamhop-btn">Find Order</button>
            </form>
          </div>

          <!-- Step 2: Order Product Selection Portal -->
          <div id="view-portal" class="glamhop-view">
            <h2 class="glamhop-view-title">Select Items for Return or Size Exchange</h2>
            <p class="glamhop-view-desc">Choose the action you wish to take for each item below.</p>

            <div class="glamhop-order-meta">
              <span>Order Number: <strong id="portal-meta-order"></strong></span>
              <span>Date: <strong id="portal-meta-date"></strong></span>
            </div>

            <div id="portal-products-list"></div>

            <button class="glamhop-btn glamhop-btn-outline" onclick="resetToLookup()">Back to search</button>
          </div>

          <!-- Step 3: Submitting request loader -->
          <div id="view-submitting" class="glamhop-view">
            <div class="glamhop-spinner-container">
              <div class="glamhop-spinner"></div>
              <p style="font-weight: 500;">Validating and processing request...</p>
            </div>
          </div>

          <!-- Step 4: Success confirmation screen -->
          <div id="view-success" class="glamhop-view">
            <div class="glamhop-success-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h2 class="glamhop-view-title" style="margin-bottom: 12px;">Request Submitted</h2>
            <p class="glamhop-view-desc" style="margin-bottom: 24px;">Your request has been submitted successfully.</p>
            
            <div style="background: #fafafa; border: 1px solid #eeeeee; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 30px;">
              <span style="font-size: 13px; color: #777777; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Request ID</span>
              <strong id="success-request-id" style="font-size: 20px; color: #000000; letter-spacing: 0.05em;"></strong>
            </div>

            <button class="glamhop-btn" onclick="resetToLookup()">Done</button>
          </div>
        </div>
      </div>

      <!-- Action Dialog Popup Modal Form -->
      <div id="action-modal" class="glamhop-modal-backdrop">
        <div class="glamhop-modal">
          <div class="glamhop-modal-header">
            <h3 id="modal-header-title" class="glamhop-modal-title">Initiate Return</h3>
            <button class="glamhop-modal-close" onclick="closeActionModal()">&times;</button>
          </div>

          <div style="display: flex; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f5f5f5;">
            <img id="modal-item-img" src="" class="glamhop-prod-img" style="width: 50px; height: 68px;" />
            <div>
              <h4 id="modal-item-title" style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;"></h4>
              <span id="modal-item-variant" style="font-size: 12px; color: #777777;"></span>
            </div>
          </div>

          <form id="request-submit-form" onsubmit="handleRequestFormSubmit(event)">
            <!-- Hidden context fields -->
            <input type="hidden" id="field-type" />
            <input type="hidden" id="field-order-id" />
            <input type="hidden" id="field-order-number" />
            <input type="hidden" id="field-item-id" />
            <input type="hidden" id="field-item-title" />
            <input type="hidden" id="field-item-variant" />
            <input type="hidden" id="field-item-img" />
            <input type="hidden" id="field-customer-name" />
            <input type="hidden" id="field-customer-email" />

            <!-- Size exchange fields -->
            <div id="group-exchange-variants" class="glamhop-form-group" style="display: none;">
              <label class="glamhop-label">Select Exchange Size/Variant</label>
              <select id="field-exchange-variant" class="glamhop-select"></select>
            </div>

            <div class="glamhop-form-group">
              <label id="label-reason-text" class="glamhop-label">Reason</label>
              <select id="field-reason" class="glamhop-select" onchange="toggleOtherReasonText()">
                ${reasonsOptions}
              </select>
            </div>

            <div id="group-other-reason" class="glamhop-form-group" style="display: none;">
              <label class="glamhop-label">Please describe details</label>
              <textarea id="field-other-reason" class="glamhop-textarea" placeholder="Explain here..."></textarea>
            </div>

            <div class="glamhop-form-group">
              <label class="glamhop-label">Upload Proof Images (Maximum 6)</label>
              <div class="glamhop-uploader" onclick="triggerPhotoInput()">
                <span style="font-size: 13px; color: #666666;">Click to upload photos (JPG, PNG, WEBP)</span>
                <input type="file" id="photo-file-input" multiple accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="handlePhotoUploads(event)" />
              </div>
              <div id="photo-previews" class="glamhop-previews"></div>
            </div>

            <div class="glamhop-form-group">
              <label class="glamhop-label">Additional Comments / Notes</label>
              <textarea id="field-comments" class="glamhop-textarea" placeholder="Add optional details for the support team..."></textarea>
            </div>

            <div class="glamhop-checkbox-container">
              <input type="checkbox" id="field-agree" required />
              <label for="field-agree">I confirm this product is in its original, unused condition, with all tags attached.</label>
            </div>

            <button type="submit" class="glamhop-btn" style="margin-top: 24px; padding: 12px 0;">Submit Return Request</button>
          </form>
        </div>
      </div>

      <script type="text/javascript">
        let verifiedOrder = null;
        let selectedItem = null;
        let uploadedBase64Images = [];

        function showView(viewId) {
          document.querySelectorAll('.glamhop-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-' + viewId).classList.add('active');
        }

        function showAlert(msg) {
          const alertBox = document.getElementById('glamhop-alert-box');
          if (msg) {
            alertBox.innerText = msg;
            alertBox.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            alertBox.style.display = 'none';
          }
        }

        function resetToLookup() {
          verifiedOrder = null;
          selectedItem = null;
          uploadedBase64Images = [];
          document.getElementById('lookup-order').value = '';
          document.getElementById('lookup-tracking').value = '';
          document.getElementById('lookup-email-phone').value = '';
          showAlert('');
          showView('lookup');
        }

        async function handleOrderLookup(e) {
          e.preventDefault();
          showAlert('');

          const orderNumber = document.getElementById('lookup-order').value;
          const trackingId = document.getElementById('lookup-tracking').value;
          const emailOrPhone = document.getElementById('lookup-email-phone').value;

          if (!orderNumber && !trackingId) {
            showAlert('Please enter either an Order Number or a Tracking ID (AWB).');
            return;
          }

          showView('submitting');

          try {
            const response = await fetch(window.location.href, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'lookup', orderNumber, trackingId, emailOrPhone })
            });

            const result = await response.json();
            if (result.success) {
              verifiedOrder = result.order;
              renderPortalProducts(result.order);
              showView('portal');
            } else {
              showView('lookup');
              showAlert(result.error || 'Failed to verify order. Please check your details.');
            }
          } catch (err) {
            console.error(err);
            showView('lookup');
            showAlert('An error occurred. Please try again.');
          }
        }

        function renderPortalProducts(order) {
          document.getElementById('portal-meta-order').innerText = order.name;
          
          const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
          document.getElementById('portal-meta-date').innerText = formattedDate;

          const container = document.getElementById('portal-products-list');
          container.innerHTML = '';

          order.lineItems.forEach(item => {
            const isEligibleRet = item.returnEligibility.eligible;
            const isEligibleExc = item.exchangeEligibility.eligible;

            const siblingVars = item.variant?.product?.variants || [];
            const variantsArg = JSON.stringify(siblingVars).replace(/"/g, '&quot;');

            let actionButtonsHtml = '';
            if (isEligibleRet) {
              actionButtonsHtml += '<button class="glamhop-action-btn glamhop-btn-ret" onclick="openActionModal(\\'RETURN\\', \\'' + item.id + '\\', \\'' + item.title.replace(/'/g, "\\'") + '\\', \\'' + (item.variant?.title || '').replace(/'/g, "\\'") + '\\', \\'' + (item.variant?.image?.url || '') + '\\', \\'' + variantsArg + '\\')">Return</button>';
            } else {
              actionButtonsHtml += '<span class="glamhop-ineligible">Return window has expired.</span>';
            }

            if (isEligibleExc) {
              actionButtonsHtml += '<button class="glamhop-action-btn glamhop-btn-exc" onclick="openActionModal(\\'EXCHANGE\\', \\'' + item.id + '\\', \\'' + item.title.replace(/'/g, "\\'") + '\\', \\'' + (item.variant?.title || '').replace(/'/g, "\\'") + '\\', \\'' + (item.variant?.image?.url || '') + '\\', \\'' + variantsArg + '\\')">Exchange</button>';
            } else if (!isEligibleRet) {
              // Only print expiry notice once if return is also expired
              actionButtonsHtml += ''; 
            } else {
              actionButtonsHtml += '<span class="glamhop-ineligible" style="margin-left: 8px;">Exchange blocked: ' + item.exchangeEligibility.reason + '</span>';
            }

            const imgUrl = item.variant?.image?.url || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';

            container.innerHTML += \`
              <div class="glamhop-product-card">
                <img class="glamhop-prod-img" src="\${imgUrl}" alt="\${item.title}" />
                <div class="glamhop-prod-details">
                  <h3 class="glamhop-prod-title">\${item.title}</h3>
                  <div class="glamhop-prod-variant">Variant: \${item.variant?.title || 'Default'} • Qty: \${item.quantity}</div>
                  <div class="glamhop-prod-variant" style="margin-top:-6px; color:#555;">Delivery Date: \${item.estimatedDeliveryDate || 'N/A'}</div>
                  <div class="glamhop-prod-actions">
                    \${actionButtonsHtml}
                  </div>
                </div>
              </div>
            \`;
          });
        }

        function openActionModal(type, itemId, title, variant, imageUrl, variantsJson) {
          uploadedBase64Images = [];
          document.getElementById('photo-previews').innerHTML = '';
          document.getElementById('request-submit-form').reset();
          showAlert('');

          document.getElementById('field-type').value = type;
          document.getElementById('field-order-id').value = verifiedOrder.id;
          document.getElementById('field-order-number').value = verifiedOrder.name;
          document.getElementById('field-item-id').value = itemId;
          document.getElementById('field-item-title').value = title;
          document.getElementById('field-item-variant').value = variant;
          document.getElementById('field-item-img').value = imageUrl;
          document.getElementById('field-customer-name').value = verifiedOrder.customerName;
          document.getElementById('field-customer-email').value = verifiedOrder.customerEmail;

          // Modal layout updates
          document.getElementById('modal-header-title').innerText = type === 'RETURN' ? 'Initiate Return' : 'Initiate Exchange';
          document.getElementById('label-reason-text').innerText = type === 'RETURN' ? 'Reason for Return' : 'Reason for Exchange';
          document.getElementById('modal-item-img').src = imageUrl || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
          document.getElementById('modal-item-title').innerText = title;
          document.getElementById('modal-item-variant').innerText = 'Variant: ' + variant;

          const sizeGroup = document.getElementById('group-exchange-variants');
          const sizeSelect = document.getElementById('field-exchange-variant');

          if (type === 'EXCHANGE') {
            sizeSelect.innerHTML = '';
            const siblingVariants = JSON.parse(variantsJson);
            siblingVariants.forEach(v => {
              const inStock = v.inventoryQuantity > 0;
              sizeSelect.innerHTML += '<option value="' + v.id + '"' + (!inStock ? ' disabled' : '') + '>' + v.title + (!inStock ? ' (Out of stock)' : '') + '</option>';
            });
            sizeGroup.style.display = 'block';
          } else {
            sizeGroup.style.display = 'none';
          }

          document.getElementById('group-other-reason').style.display = 'none';
          document.getElementById('action-modal').style.display = 'flex';
        }

        function closeActionModal() {
          document.getElementById('action-modal').style.display = 'none';
        }

        function toggleOtherReasonText() {
          const val = document.getElementById('field-reason').value;
          document.getElementById('group-other-reason').style.display = (val.toLowerCase() === 'other') ? 'block' : 'none';
        }

        function triggerPhotoInput() {
          document.getElementById('photo-file-input').click();
        }

        function handlePhotoUploads(e) {
          const files = e.target.files;
          const container = document.getElementById('photo-previews');
          
          const maxFiles = Math.min(files.length, 6 - uploadedBase64Images.length);
          for (let i = 0; i < maxFiles; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = function(evt) {
              const base64 = evt.target.result;
              uploadedBase64Images.push(base64);
              container.innerHTML += '<div class="glamhop-preview-item"><img src="' + base64 + '" /></div>';
            }
            reader.readAsDataURL(file);
          }
        }

        async function handleRequestFormSubmit(e) {
          e.preventDefault();
          closeActionModal();
          showAlert('');
          showView('submitting');

          const selectEl = document.getElementById('field-exchange-variant');
          const selectedExchangeVariantTitle = selectEl.options[selectEl.selectedIndex]?.text || '';

          const body = {
            action: 'create_request',
            type: document.getElementById('field-type').value,
            orderId: document.getElementById('field-order-id').value,
            orderNumber: document.getElementById('field-order-number').value,
            lineItemId: document.getElementById('field-item-id').value,
            productTitle: document.getElementById('field-item-title').value,
            variantTitle: document.getElementById('field-item-variant').value,
            imageUrl: document.getElementById('field-item-img').value,
            quantity: 1, // default quantity per item request
            reason: document.getElementById('field-reason').value,
            otherReasonText: document.getElementById('field-other-reason').value || '',
            exchangeVariantId: document.getElementById('field-exchange-variant').value || '',
            exchangeVariantTitle: selectedExchangeVariantTitle,
            customerNotes: document.getElementById('field-comments').value || '',
            customerName: document.getElementById('field-customer-name').value,
            customerEmail: document.getElementById('field-customer-email').value,
            images: uploadedBase64Images
          };

          try {
            const response = await fetch(window.location.href, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });

            const result = await response.json();
            if (result.success) {
              document.getElementById('success-request-id').innerText = result.requestId;
              showView('success');
            } else {
              showView('portal');
              showAlert(result.error || 'Failed to submit your return request.');
            }
          } catch (err) {
            console.error(err);
            showView('portal');
            showAlert('An error occurred during submission.');
          }
        }
      </script>
    `;

    return new Response(liquidTemplate, {
      headers: {
        "Content-Type": "application/liquid",
      },
    });
  } catch (err: any) {
    console.error("Error rendering customer portal:", err);
    return new Response("<div style='padding:40px; text-align:center; color:red; font-family:sans-serif;'>GlamHop returns portal is temporarily unavailable.</div>", {
      headers: { "Content-Type": "application/liquid" },
    });
  }
};

// Action: Processes storefront lookup and request submissions
export const action = async ({ request }: ActionFunctionArgs) => {
  await dbLog("PROXY_ACTION_START", request.url);

  try {
    const { session, admin } = await shopify.authenticate.public.appProxy(request);
    if (!session || !admin) {
      await dbLog("PROXY_ACTION_UNAUTHORIZED", `Unauthorized signed proxy request: ${request.url}`);
      return json({ success: false, error: "Unauthorized signed proxy request" }, { status: 401 });
    }

    const shop = session.shop;
    const payload = await request.json();
    await dbLog("PROXY_ACTION_PARAMS", JSON.stringify(payload));
    const { action: actionType } = payload;

    // A. Verify Order & Check Eligibility
    if (actionType === "lookup") {
      const { orderNumber, trackingId, emailOrPhone } = payload;
      if (!emailOrPhone) {
        return json({ success: false, error: "Email or Phone Number is required." }, { status: 400 });
      }
      if (!orderNumber && !trackingId) {
        return json({ success: false, error: "Please enter either an Order Number or a Tracking ID (AWB)." }, { status: 400 });
      }

      let searchQuery = "";
      if (orderNumber) {
        searchQuery = `name:${orderNumber.trim()}`;
      } else if (trackingId) {
        searchQuery = `tracking_number:${trackingId.trim()}`;
      }

      await dbLog("PROXY_ACTION_QUERY", searchQuery);

      // Query order details matching name or tracking number via Admin GraphQL
      const response = await admin.graphql(
        `#graphql
        query getOrders($query: String!) {
          orders(first: 5, query: $query) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                email
                phone
                customer {
                  firstName
                  lastName
                  email
                  phone
                }
                fulfillments {
                  createdAt
                  trackingInfo {
                    number
                  }
                }
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
                          variants(first: 20) {
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
        }`,
        {
          variables: {
            query: searchQuery,
          },
        }
      );

      const responseData = await response.json();
      
      if (responseData.errors) {
        await dbLog("PROXY_ACTION_GRAPHQL_ERROR", JSON.stringify(responseData.errors));
        return json({ success: false, error: `Shopify API Error: ${responseData.errors[0]?.message}` }, { status: 500 });
      }

      const orders = responseData.data?.orders?.edges || [];
      await dbLog("PROXY_ACTION_ORDERS_FOUND", `Count: ${orders.length}`);

      // Find precise order and verify email/phone match
      const emailOrPhoneNormalized = emailOrPhone.trim().toLowerCase();
      const matchedOrderEdge = orders.find(({ node: order }: any) => {
        let isMatch = false;
        if (orderNumber) {
          isMatch = order.name.toLowerCase() === orderNumber.trim().toLowerCase() ||
                    order.name.toLowerCase() === `#${orderNumber.trim().toLowerCase()}`;
        } else if (trackingId) {
          isMatch = order.fulfillments?.some((f: any) => 
            f.trackingInfo?.some((t: any) => t.number?.trim().toLowerCase() === trackingId.trim().toLowerCase())
          );
        }

        if (!isMatch) return false;

        const customerEmail = (order.email || order.customer?.email || "").toLowerCase();
        const customerPhone = (order.phone || order.customer?.phone || "").replace(/\D/g, "");
        const inputDigits = emailOrPhoneNormalized.replace(/\D/g, "");

        const emailMatch = customerEmail === emailOrPhoneNormalized;
        const phoneMatch = inputDigits.length >= 7 && customerPhone.endsWith(inputDigits);

        return emailMatch || phoneMatch;
      });

      if (!matchedOrderEdge) {
        await dbLog("PROXY_ACTION_ORDER_MISMATCH", `No matching order found for query: ${searchQuery} & identity: ${emailOrPhone}`);
        return json({ success: false, error: "No matching order found with the provided details." }, { status: 404 });
      }

      const order = matchedOrderEdge.node;
      await dbLog("PROXY_ACTION_ORDER_MATCHED", `Order Name: ${order.name}`);

      // 7-day post-delivery window eligibility calculation
      const isDelivered = order.displayFulfillmentStatus === "FULFILLED";
      
      let deliveryDate = new Date(order.createdAt);
      if (isDelivered && order.fulfillments && order.fulfillments.length > 0) {
        const lastFulfillment = order.fulfillments[order.fulfillments.length - 1];
        const fulfillmentDate = new Date(lastFulfillment.createdAt);
        // Estimate delivery date as 3 days after fulfillment creation date
        deliveryDate = new Date(fulfillmentDate);
        deliveryDate.setDate(deliveryDate.getDate() + 3);
      } else {
        // Fallback: estimate 3 days after order date
        deliveryDate.setDate(deliveryDate.getDate() + 3);
      }

      const currentDate = new Date();
      const diffTime = currentDate.getTime() - deliveryDate.getTime();
      const elapsedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const withinWindow = isDelivered && elapsedDays <= 7;
      await dbLog("PROXY_ACTION_ELIGIBILITY", `isDelivered: ${isDelivered}, elapsedDays: ${elapsedDays}, withinWindow: ${withinWindow}`);

      // Fetch any existing requests for this order to prevent duplicate requests
      const existingRequests = await db.returnRequest.findMany({
        where: { shop, orderId: order.id, status: { not: "REJECTED" } },
        include: { items: true },
      });

      const lineItems = order.lineItems.edges.map(({ node: item }: any) => {
        const hasActiveReturn = existingRequests.some(r => r.items.some(i => i.lineItemId === item.id && i.type === "RETURN"));
        const hasActiveExchange = existingRequests.some(r => r.items.some(i => i.lineItemId === item.id && i.type === "EXCHANGE"));

        const siblingVariants = item.variant?.product?.variants?.edges?.map(({ node: v }: any) => ({
          id: v.id,
          title: v.title,
          inventoryQuantity: v.inventoryQuantity,
        })) || [];

        const totalInventory = siblingVariants.reduce((sum: number, v: any) => sum + (v.inventoryQuantity || 0), 0);

        const retEligible = isDelivered && withinWindow && !hasActiveReturn;
        const excEligible = isDelivered && withinWindow && !hasActiveExchange && totalInventory > 0;

        const returnReason = !isDelivered
          ? "Item has not been fulfilled yet."
          : !withinWindow
            ? "Exceeded 7 days return window after delivery."
            : hasActiveReturn
              ? "A return request is already active for this item."
              : "";

        const exchangeReason = !isDelivered
          ? "Item has not been fulfilled yet."
          : !withinWindow
            ? "Exceeded 7 days exchange window after delivery."
            : hasActiveExchange
              ? "An exchange request is already active for this item."
              : totalInventory === 0
                ? "Item variant options are currently out of stock."
                : "";

        return {
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          estimatedDeliveryDate: deliveryDate.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
          }),
          variant: {
            id: item.variant?.id,
            title: item.variant?.title,
            image: {
              url: item.variant?.image?.url,
            },
            product: {
              variants: siblingVariants,
            },
          },
          returnEligibility: {
            eligible: retEligible,
            reason: returnReason,
          },
          exchangeEligibility: {
            eligible: excEligible,
            reason: exchangeReason,
          },
        };
      });

      return json({
        success: true,
        order: {
          id: order.id,
          name: order.name,
          createdAt: order.createdAt,
          customerName: order.customer ? `${order.customer.firstName} ${order.customer.lastName}`.trim() : "Customer",
          customerEmail: order.email || order.customer?.email || "",
          lineItems,
        },
      });
    }

    // B. Create Return/Exchange Request
    if (actionType === "create_request") {
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
        exchangeVariantId,
        exchangeVariantTitle,
        customerNotes,
        customerName,
        customerEmail,
        images,
      } = payload;

      const requestsCount = await db.returnRequest.count({ where: { shop } });
      const requestId = `GHR-${String(requestsCount + 1).padStart(6, "0")}`;

      const createdRequest = await db.returnRequest.create({
        data: {
          requestId,
          shop,
          customerId: payload.customerId || `gid://shopify/Customer/guest`,
          customerName: customerName || "Guest Customer",
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
              exchangeVariantId: exchangeVariantId || null,
              exchangeVariantTitle: exchangeVariantTitle || null,
              images: {
                create: (images || []).map((imgBase64: string) => ({
                  url: imgBase64,
                })),
              },
            },
          },
          timeline: {
            create: {
              status: "SUBMITTED",
              title: "Request Submitted",
              description: `A ${type.toLowerCase()} request for item "${productTitle}" has been submitted by customer.`,
            },
          },
        },
      });

      // Update Shopify Order tags to mark request submission
      try {
        const orderResponse = await admin.graphql(
          `#graphql
          query getOrderTags($id: ID!) {
            order(id: $id) {
              tags
            }
          }`,
          { variables: { id: orderId } }
        );
        const orderData = await orderResponse.json();
        const currentTags = orderData.data?.order?.tags || [];
        const newTags = Array.from(new Set([...currentTags, "GlamHop-Request-Submitted"]));

        await admin.graphql(
          `#graphql
          mutation updateOrderTags($id: ID!, $tags: [String!]) {
            orderUpdate(input: { id: $id, tags: $tags }) {
              order {
                id
                tags
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              id: orderId,
              tags: newTags,
            },
          }
        );
      } catch (err: any) {
        console.error("Failed to tag Shopify order:", err.message);
      }

      await dbLog("PROXY_ACTION_REQUEST_CREATED", `Request ID: ${requestId}`);
      return json({ success: true, requestId });
    }

    return json({ success: false, error: "Unsupported action type" }, { status: 400 });
  } catch (error: any) {
    console.error("CRITICAL ERROR IN PROXY ACTION:", error);
    await dbLog("PROXY_ACTION_ERROR", `${error.message}\n${error.stack}`);
    return json({ success: false, error: error.message || "An unexpected error occurred" }, { status: 500 });
  }
};

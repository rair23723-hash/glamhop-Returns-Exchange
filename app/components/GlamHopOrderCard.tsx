import React from "react";

export interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  price?: string;
  variant?: {
    id: string;
    title: string;
    image?: {
      url: string;
      altText?: string;
    };
    selectedOptions?: {
      name: string;
      value: string;
    }[];
    product?: {
      id: string;
      title: string;
      images?: {
        edges: {
          node: {
            url: string;
            altText?: string;
          };
        }[];
      };
    };
  };
  // Auto eligibility properties
  returnEligible?: boolean;
  exchangeEligible?: boolean;
  returnIneligibleReason?: string;
  exchangeIneligibleReason?: string;
}

export interface OrderProps {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  items: OrderItem[];
  currencySymbol?: string;
  onReturn?: (item: OrderItem, orderId: string, orderNumber: string) => void;
  onExchange?: (item: OrderItem, orderId: string, orderNumber: string) => void;
}

export default function GlamHopOrderCard({
  id,
  name,
  createdAt,
  displayFinancialStatus,
  displayFulfillmentStatus,
  items,
  onReturn,
  onExchange,
}: OrderProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="order-card">
      <div className="order-header">
        <div className="order-info-block">
          <h3>Order {name}</h3>
          <span className="order-date">{formattedDate}</span>
        </div>
        <div className="order-status-badges">
          <span className={`badge ${displayFinancialStatus.toLowerCase()}`}>
            {displayFinancialStatus}
          </span>
          <span className={`badge ${displayFulfillmentStatus.toLowerCase()}`}>
            {displayFulfillmentStatus}
          </span>
        </div>
      </div>

      <div className="order-items-list">
        {items.map((item) => {
          const imageUrl =
            item.variant?.image?.url ||
            item.variant?.product?.images?.edges?.[0]?.node?.url ||
            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png";

          const colorOption = item.variant?.selectedOptions?.find(
            (o) =>
              o.name.toLowerCase() === "color" ||
              o.name.toLowerCase() === "colour"
          )?.value;

          const sizeOption = item.variant?.selectedOptions?.find(
            (o) => o.name.toLowerCase() === "size"
          )?.value;

          return (
            <div className="item-row" key={item.id}>
              <div className="item-image-wrapper">
                <img
                  src={imageUrl}
                  alt={item.variant?.image?.altText || item.title}
                  className="item-image"
                />
              </div>
              <div className="item-details">
                <div>
                  <h4 className="item-title">
                    {item.variant?.product?.title || item.title}
                  </h4>
                  <div className="item-options">
                    {item.variant?.title &&
                      item.variant.title !== "Default Title" && (
                        <span className="option-tag">
                          <strong>Variant:</strong> {item.variant.title}
                        </span>
                      )}
                    {colorOption && (
                      <span className="option-tag">
                        <strong>Color:</strong> {colorOption}
                      </span>
                    )}
                    {sizeOption && (
                      <span className="option-tag">
                        <strong>Size:</strong> {sizeOption}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="item-quantity-price">
                    <span>Qty: {item.quantity}</span>
                  </div>

                  <div className="item-actions" style={{ flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                      {item.returnEligible ? (
                        <button
                          type="button"
                          className="btn-portal btn-portal-primary"
                          style={{ flex: 1 }}
                          onClick={() => onReturn?.(item, id, name)}
                        >
                          Return
                        </button>
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            padding: "8px",
                            border: "1px dashed #dddddd",
                            borderRadius: "6px",
                            fontSize: "11px",
                            color: "#999999",
                            textAlign: "center",
                            backgroundColor: "#fcfcfc",
                          }}
                        >
                          Return Ineligible: {item.returnIneligibleReason || "Policy restriction"}
                        </div>
                      )}

                      {item.exchangeEligible ? (
                        <button
                          type="button"
                          className="btn-portal btn-portal-secondary"
                          style={{ flex: 1 }}
                          onClick={() => onExchange?.(item, id, name)}
                        >
                          Exchange
                        </button>
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            padding: "8px",
                            border: "1px dashed #dddddd",
                            borderRadius: "6px",
                            fontSize: "11px",
                            color: "#999999",
                            textAlign: "center",
                            backgroundColor: "#fcfcfc",
                          }}
                        >
                          Exchange Ineligible: {item.exchangeIneligibleReason || "Policy restriction"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

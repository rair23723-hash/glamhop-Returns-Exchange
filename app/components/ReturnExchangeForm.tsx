import React, { useState } from "react";

export interface ReturnExchangeFormProps {
  orderName: string;
  orderId: string;
  deliveryDate: string;
  item: {
    id: string;
    title: string;
    quantity: number;
    variant?: {
      id: string;
      title: string;
      image?: {
        url: string;
      };
      selectedOptions?: {
        name: string;
        value: string;
      }[];
      availableSizes?: string[]; // Extracted size options
    };
  };
  type: "RETURN" | "EXCHANGE";
  onClose: () => void;
  onSubmit: (formData: any) => void;
}

export default function ReturnExchangeForm({
  orderName,
  orderId,
  deliveryDate,
  item,
  type,
  onClose,
  onSubmit,
}: ReturnExchangeFormProps) {
  const isReturn = type === "RETURN";

  // Reasons dropdown options
  const returnReasons = [
    "Wrong Size",
    "Wrong Product",
    "Damaged Product",
    "Defective Product",
    "Quality Issue",
    "Product Not As Expected",
    "Changed Mind",
    "Other",
  ];

  const exchangeReasons = [
    "Size Too Small",
    "Size Too Large",
    "Received Wrong Size",
    "Received Wrong Product",
    "Damaged Product",
    "Other",
  ];

  const [reason, setReason] = useState(isReturn ? returnReasons[0] : exchangeReasons[0]);
  const [otherText, setOtherText] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]); // Base64 image strings
  const [isChecked, setIsChecked] = useState(false);
  const [selectedSize, setSelectedSize] = useState("");

  const sizeOptions = item.variant?.availableSizes || ["S", "M", "L", "XL", "XXL"];

  // Check if reason is size related to show size selection
  const isSizeRelatedReason =
    !isReturn &&
    (reason === "Size Too Small" ||
      reason === "Size Too Large" ||
      reason === "Received Wrong Size");

  // Options extractor
  const colorVal = item.variant?.selectedOptions?.find(
    (o) => o.name.toLowerCase() === "color" || o.name.toLowerCase() === "colour"
  )?.value;

  const sizeVal = item.variant?.selectedOptions?.find(
    (o) => o.name.toLowerCase() === "size"
  )?.value;

  const imageUrl =
    item.variant?.image?.url ||
    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    
    // Check limit
    if (images.length + filesArray.length > 5) {
      alert("You can upload a maximum of 5 images.");
      return;
    }

    filesArray.forEach((file) => {
      // Validate format
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        alert("Please upload JPG, JPEG, PNG or WEBP formats only.");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isReturn && !isChecked) {
      alert("Please confirm that the product is unused and follows our policy.");
      return;
    }

    if (isSizeRelatedReason && !selectedSize) {
      alert("Please select a new size for exchange.");
      return;
    }

    onSubmit({
      type,
      orderId,
      orderNumber: orderName,
      lineItemId: item.id,
      productTitle: item.title,
      variantTitle: item.variant?.title,
      imageUrl,
      quantity: item.quantity,
      reason,
      otherReasonText: reason === "Other" ? otherText : null,
      customerNotes: description,
      requestedSize: isSizeRelatedReason ? selectedSize : null,
      images,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#ffffff",
        zIndex: 1000,
        overflowY: "auto",
        padding: "40px 20px",
      }}
    >
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #eeeeee",
            paddingBottom: "20px",
            marginBottom: "30px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              fontSize: "14px",
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            ← Back to Orders
          </button>
          <h2
            style={{
              fontFamily: "var(--glamhop-font-serif, serif)",
              fontSize: "20px",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Request {isReturn ? "Return" : "Exchange"}
          </h2>
        </div>

        {/* Product Brief Summary Card */}
        <div
          style={{
            display: "flex",
            gap: "20px",
            border: "1px solid #eeeeee",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "30px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ width: "80px", height: "110px", flexShrink: 0 }}>
            <img
              src={imageUrl}
              alt={item.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              fontSize: "14px",
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: "var(--glamhop-font-serif, serif)",
                  margin: "0 0 6px 0",
                  fontSize: "16px",
                }}
              >
                {item.title}
              </h3>
              <div style={{ color: "#707070", fontSize: "13px" }}>
                {item.variant?.title && item.variant.title !== "Default Title" && (
                  <span style={{ marginRight: "12px" }}>
                    <strong>Variant:</strong> {item.variant.title}
                  </span>
                )}
                {colorVal && (
                  <span style={{ marginRight: "12px" }}>
                    <strong>Color:</strong> {colorVal}
                  </span>
                )}
                {sizeVal && (
                  <span>
                    <strong>Size:</strong> {sizeVal}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div>
                <strong>Order:</strong> {orderName}
              </div>
              <div style={{ color: "#707070", fontSize: "12px", marginTop: "4px" }}>
                Delivery Date: {deliveryDate}
              </div>
            </div>
          </div>
        </div>

        {/* Main Interaction Form */}
        <form onSubmit={handleFormSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Reason selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Reason for {isReturn ? "Return" : "Exchange"}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  padding: "12px",
                  fontSize: "14px",
                  borderRadius: "6px",
                  border: "1px solid #cccccc",
                  backgroundColor: "#ffffff",
                  fontFamily: "inherit",
                }}
              >
                {(isReturn ? returnReasons : exchangeReasons).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Other reason description */}
            {reason === "Other" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Please specify other reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Tell us why..."
                  style={{
                    padding: "12px",
                    fontSize: "14px",
                    borderRadius: "6px",
                    border: "1px solid #cccccc",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
            )}

            {/* Size Exchange options */}
            {isSizeRelatedReason && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Select New Size
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {sizeOptions.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSelectedSize(sz)}
                      style={{
                        padding: "10px 16px",
                        fontSize: "13px",
                        fontWeight: 500,
                        border: "1px solid #000000",
                        borderRadius: "4px",
                        cursor: "pointer",
                        backgroundColor: selectedSize === sz ? "#000000" : "#ffffff",
                        color: selectedSize === sz ? "#ffffff" : "#000000",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Extra Comments */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Describe your issue / Comments
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional notes about the item..."
                style={{
                  padding: "12px",
                  fontSize: "14px",
                  borderRadius: "6px",
                  border: "1px solid #cccccc",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Image uploader */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Upload Images (Max 5)
              </label>
              <span style={{ fontSize: "12px", color: "#707070", marginBottom: "8px" }}>
                Supported formats: JPG, JPEG, PNG, WEBP.
              </span>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: "relative",
                      width: "80px",
                      height: "80px",
                      border: "1px solid #eeeeee",
                      borderRadius: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <img src={img} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      style={{
                        position: "absolute",
                        top: "2px",
                        right: "2px",
                        backgroundColor: "rgba(0,0,0,0.6)",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "50%",
                        width: "18px",
                        height: "18px",
                        fontSize: "10px",
                        lineHeight: "18px",
                        textAlign: "center",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {images.length < 5 && (
                  <label
                    style={{
                      width: "80px",
                      height: "80px",
                      borderRadius: "6px",
                      border: "1px dashed #cccccc",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      cursor: "pointer",
                      fontSize: "24px",
                      color: "#999999",
                      userSelect: "none",
                    }}
                  >
                    +
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Policy Consent checkbox */}
            {isReturn && (
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "10px" }}>
                <input
                  type="checkbox"
                  id="confirm-policy"
                  checked={isChecked}
                  onChange={(e) => setIsChecked(e.target.checked)}
                  style={{ marginTop: "4px" }}
                />
                <label htmlFor="confirm-policy" style={{ fontSize: "13px", color: "#333333", lineHeight: "1.4" }}>
                  I confirm this product is unused and follows GlamHop Return Policy.
                </label>
              </div>
            )}

            {/* Form actions */}
            <div style={{ marginTop: "20px" }}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "16px",
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "14px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  transition: "background-color 0.2s ease",
                }}
              >
                Submit {isReturn ? "Return" : "Exchange"} Request
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

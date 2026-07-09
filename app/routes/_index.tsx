import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // Redirect to admin portal if shop domain is present in the parameters
  if (shop) {
    return redirect(`/app?shop=${shop}`);
  }

  return json({ ok: true });
};

export default function Index() {
  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        lineHeight: "1.6",
        padding: "60px 24px",
        maxWidth: "500px",
        margin: "120px auto",
        backgroundColor: "#ffffff",
        border: "1px solid #eeeeee",
        borderRadius: "16px",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.02)",
        textAlign: "center",
      }}
    >
      {/* GlamHop Luxury Logo Brand */}
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "28px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#000000",
          marginBottom: "6px",
        }}
      >
        GlamHop
      </h1>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#707070",
          display: "block",
          marginBottom: "40px",
        }}
      >
        Returns & Exchange
      </span>

      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: "#fafafa",
          border: "1px solid #eeeeee",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px auto",
          color: "#000000",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: "18px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#000000",
        }}
      >
        Automated Returns Portal
      </h2>
      
      <p style={{ color: "#666666", fontSize: "14px", marginBottom: "0", lineHeight: "1.6" }}>
        To request a return or size exchange for your purchase, please log in to your **Customer Account** directly on our online storefront.
      </p>
      <p style={{ color: "#888888", fontSize: "13px", marginTop: "12px", lineHeight: "1.6" }}>
        From your order history page, select any eligible items to submit an automated request.
      </p>
    </div>
  );
}

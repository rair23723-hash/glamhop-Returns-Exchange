import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    return redirect(`/app?shop=${shop}`);
  }

  return json({ showForm: true });
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        lineHeight: "1.6",
        padding: "60px 20px",
        maxWidth: "480px",
        margin: "80px auto",
        backgroundColor: "#ffffff",
        border: "1px solid #eeeeee",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          fontSize: "22px",
          fontWeight: 600,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}
      >
        GlamHop Returns & Exchange
      </h2>
      <p style={{ color: "#666666", fontSize: "14px", marginBottom: "32px" }}>
        Please install this app via the Shopify App Store or enter your shop domain below to log in.
      </p>

      <Form method="get" action="/app">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="text"
            name="shop"
            placeholder="example.myshopify.com"
            required
            style={{
              padding: "12px 16px",
              border: "1px solid #dddddd",
              borderRadius: "6px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "12px 20px",
              backgroundColor: "#000000",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              transition: "opacity 0.2s",
            }}
          >
            Log In
          </button>
        </div>
      </Form>
    </div>
  );
}

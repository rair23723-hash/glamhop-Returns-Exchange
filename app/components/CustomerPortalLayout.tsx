import React from "react";

interface CustomerPortalLayoutProps {
  children: React.ReactNode;
  shopName?: string;
  shopUrl?: string;
}

export default function CustomerPortalLayout({
  children,
  shopName = "GlamHop",
  shopUrl,
}: CustomerPortalLayoutProps) {
  return (
    <div className="portal-container">
      <header className="portal-header">
        <h1 className="portal-logo">{shopName}</h1>
        <div className="portal-subtitle">Returns & Exchange Portal</div>
      </header>
      <main>{children}</main>
      <footer
        style={{
          marginTop: "60px",
          textAlign: "center",
          fontSize: "12px",
          color: "#999999",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        &copy; {new Date().getFullYear()} {shopName}. All Rights Reserved.
      </footer>
    </div>
  );
}

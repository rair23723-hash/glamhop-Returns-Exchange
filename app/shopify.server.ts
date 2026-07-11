import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { Session } from "@shopify/shopify-api";
import prisma from "./db.server";

export const dbLog = async (stage: string, message: string) => {
  try {
    await prisma.session.create({
      data: {
        id: `db_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        shop: "glamhop-logs.myshopify.com",
        state: stage,
        accessToken: message,
        isOnline: false,
      },
    });
  } catch (e: any) {
    console.error("Failed to write db log:", e.message);
  }
};

const customSessionStorage = {
  storeSession: async (session: any) => {
    const sessionParams = session.toObject();
    
    let userId: bigint | null = null;
    if (sessionParams.onlineAccessInfo) {
      const oInfo = sessionParams.onlineAccessInfo;
      if (typeof oInfo === "object" && oInfo.associated_user) {
        userId = BigInt(oInfo.associated_user.id);
      } else if (typeof oInfo === "string" || typeof oInfo === "number") {
        userId = BigInt(oInfo);
      }
    }

    const data = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope || null,
      expires: session.expires || null,
      accessToken: session.accessToken || "",
      userId,
    };

    await dbLog("STORE_SESSION_START", JSON.stringify({
      id: session.id,
      shop: session.shop,
      isOnline: session.isOnline,
    }));

    try {
      const result = await prisma.session.upsert({
        where: { id: session.id },
        update: data,
        create: data,
      });
      await dbLog("STORE_SESSION_SUCCESS", `Result: ${!!result}`);
      return true;
    } catch (error: any) {
      await dbLog("STORE_SESSION_ERROR", `${error.message}\n${error.stack}`);
      throw error;
    }
  },

  loadSession: async (id: string) => {
    await dbLog("LOAD_SESSION_START", `id: ${id}`);
    try {
      const row = await prisma.session.findUnique({
        where: { id },
      });

      if (!row) {
        await dbLog("LOAD_SESSION_SUCCESS", "found: false");
        return undefined;
      }

      const sessionParams: any = {
        id: row.id,
        shop: row.shop,
        state: row.state,
        isOnline: row.isOnline,
      };

      if (row.expires) {
        sessionParams.expires = row.expires.getTime();
      }
      if (row.scope) {
        sessionParams.scope = row.scope;
      }
      if (row.accessToken) {
        sessionParams.accessToken = row.accessToken;
      }
      if (row.userId) {
        sessionParams.onlineAccessInfo = String(row.userId);
      }

      const session = Session.fromPropertyArray(Object.entries(sessionParams));
      await dbLog("LOAD_SESSION_SUCCESS", "found: true");
      return session;
    } catch (error: any) {
      await dbLog("LOAD_SESSION_ERROR", `${error.message}\n${error.stack}`);
      throw error;
    }
  },

  deleteSession: async (id: string) => {
    await dbLog("DELETE_SESSION_START", `id: ${id}`);
    try {
      await prisma.session.delete({
        where: { id },
      });
      await dbLog("DELETE_SESSION_SUCCESS", "Result: true");
      return true;
    } catch (error: any) {
      await dbLog("DELETE_SESSION_ERROR", `${error.message}\n${error.stack}`);
      return true;
    }
  },

  deleteSessions: async (ids: string[]) => {
    await dbLog("DELETE_SESSIONS_START", `ids: ${ids.join(",")}`);
    try {
      await prisma.session.deleteMany({
        where: { id: { in: ids } },
      });
      await dbLog("DELETE_SESSIONS_SUCCESS", "Result: true");
      return true;
    } catch (error: any) {
      await dbLog("DELETE_SESSIONS_ERROR", `${error.message}\n${error.stack}`);
      throw error;
    }
  },

  findSessionsByShop: async (shop: string) => {
    await dbLog("FIND_SESSIONS_START", `shop: ${shop}`);
    try {
      const rows = await prisma.session.findMany({
        where: { shop },
        take: 25,
        orderBy: [{ expires: "desc" }],
      });

      const sessions = rows.map((row) => {
        const sessionParams: any = {
          id: row.id,
          shop: row.shop,
          state: row.state,
          isOnline: row.isOnline,
        };

        if (row.expires) {
          sessionParams.expires = row.expires.getTime();
        }
        if (row.scope) {
          sessionParams.scope = row.scope;
        }
        if (row.accessToken) {
          sessionParams.accessToken = row.accessToken;
        }
        if (row.userId) {
          sessionParams.onlineAccessInfo = String(row.userId);
        }

        return Session.fromPropertyArray(Object.entries(sessionParams));
      });

      await dbLog("FIND_SESSIONS_SUCCESS", `count: ${sessions.length}`);
      return sessions;
    } catch (error: any) {
      await dbLog("FIND_SESSIONS_ERROR", `${error.message}\n${error.stack}`);
      throw error;
    }
  },
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL!,
  authPathPrefix: "/auth",
  sessionStorage: customSessionStorage,
  // Private custom app — SingleMerchant, not AppStore
  distribution: AppDistribution.SingleMerchant,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

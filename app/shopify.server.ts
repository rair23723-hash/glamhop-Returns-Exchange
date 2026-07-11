import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
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

let baseSessionStorage: PrismaSessionStorage | null = null;

const getSessionStorage = () => {
  if (!baseSessionStorage) {
    baseSessionStorage = new PrismaSessionStorage(prisma);
  }
  return baseSessionStorage;
};

const loggingSessionStorage = {
  storeSession: async (session: any) => {
    const details = JSON.stringify({
      id: session.id,
      shop: session.shop,
      isOnline: session.isOnline,
      expires: session.expires,
    });
    await dbLog("STORE_SESSION_START", details);
    try {
      const storage = getSessionStorage();
      const result = await storage.storeSession(session);
      await dbLog("STORE_SESSION_SUCCESS", `Result: ${result}`);
      return result;
    } catch (error: any) {
      await dbLog("STORE_SESSION_ERROR", `${error.message}\n${error.stack}`);
      baseSessionStorage = null;
      throw error;
    }
  },
  loadSession: async (id: string) => {
    await dbLog("LOAD_SESSION_START", `id: ${id}`);
    try {
      const storage = getSessionStorage();
      const result = await storage.loadSession(id);
      await dbLog("LOAD_SESSION_SUCCESS", `found: ${!!result}`);
      return result;
    } catch (error: any) {
      await dbLog("LOAD_SESSION_ERROR", `${error.message}\n${error.stack}`);
      baseSessionStorage = null;
      throw error;
    }
  },
  deleteSession: async (id: string) => {
    await dbLog("DELETE_SESSION_START", `id: ${id}`);
    try {
      const storage = getSessionStorage();
      const result = await storage.deleteSession(id);
      await dbLog("DELETE_SESSION_SUCCESS", `Result: ${result}`);
      return result;
    } catch (error: any) {
      await dbLog("DELETE_SESSION_ERROR", `${error.message}\n${error.stack}`);
      baseSessionStorage = null;
      throw error;
    }
  },
  deleteSessions: async (ids: string[]) => {
    await dbLog("DELETE_SESSIONS_START", `ids: ${ids.join(",")}`);
    try {
      const storage = getSessionStorage();
      const result = await storage.deleteSessions(ids);
      await dbLog("DELETE_SESSIONS_SUCCESS", `Result: ${result}`);
      return result;
    } catch (error: any) {
      await dbLog("DELETE_SESSIONS_ERROR", `${error.message}\n${error.stack}`);
      baseSessionStorage = null;
      throw error;
    }
  },
  findSessionsByShop: async (shop: string) => {
    await dbLog("FIND_SESSIONS_START", `shop: ${shop}`);
    try {
      const storage = getSessionStorage();
      const result = await storage.findSessionsByShop(shop);
      await dbLog("FIND_SESSIONS_SUCCESS", `count: ${result?.length}`);
      return result;
    } catch (error: any) {
      await dbLog("FIND_SESSIONS_ERROR", `${error.message}\n${error.stack}`);
      baseSessionStorage = null;
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
  sessionStorage: loggingSessionStorage,
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

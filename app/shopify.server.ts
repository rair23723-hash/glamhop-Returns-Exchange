import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const baseSessionStorage = new PrismaSessionStorage(prisma);

const loggingSessionStorage = {
  storeSession: async (session: any) => {
    console.log("=== [SESSION_STORAGE] storeSession called ===", {
      id: session.id,
      shop: session.shop,
      isOnline: session.isOnline,
      expires: session.expires,
    });
    try {
      const result = await baseSessionStorage.storeSession(session);
      console.log("=== [SESSION_STORAGE] storeSession SUCCESS ===", result);
      return result;
    } catch (error: any) {
      console.error("=== [SESSION_STORAGE] storeSession ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  },
  loadSession: async (id: string) => {
    console.log("=== [SESSION_STORAGE] loadSession called ===", { id });
    try {
      const result = await baseSessionStorage.loadSession(id);
      console.log("=== [SESSION_STORAGE] loadSession SUCCESS ===", {
        found: !!result,
        shop: result?.shop,
      });
      return result;
    } catch (error: any) {
      console.error("=== [SESSION_STORAGE] loadSession ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  },
  deleteSession: async (id: string) => {
    console.log("=== [SESSION_STORAGE] deleteSession called ===", { id });
    try {
      const result = await baseSessionStorage.deleteSession(id);
      console.log("=== [SESSION_STORAGE] deleteSession SUCCESS ===", result);
      return result;
    } catch (error: any) {
      console.error("=== [SESSION_STORAGE] deleteSession ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  },
  deleteSessions: async (ids: string[]) => {
    console.log("=== [SESSION_STORAGE] deleteSessions called ===", { ids });
    try {
      const result = await baseSessionStorage.deleteSessions(ids);
      console.log("=== [SESSION_STORAGE] deleteSessions SUCCESS ===", result);
      return result;
    } catch (error: any) {
      console.error("=== [SESSION_STORAGE] deleteSessions ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  },
  findSessionsByShop: async (shop: string) => {
    console.log("=== [SESSION_STORAGE] findSessionsByShop called ===", { shop });
    try {
      const result = await baseSessionStorage.findSessionsByShop(shop);
      console.log("=== [SESSION_STORAGE] findSessionsByShop SUCCESS ===", {
        count: result?.length,
      });
      return result;
    } catch (error: any) {
      console.error("=== [SESSION_STORAGE] findSessionsByShop ERROR ===", error);
      if (error && error.stack) {
        console.error(error.stack);
      }
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

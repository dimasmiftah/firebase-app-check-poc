import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import type { Config } from "./config";

export interface VerifiedAppCheckToken {
  appId: string;
  alreadyConsumed: boolean;
}

export function createFirebaseAdmin(config: Config) {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
      projectId: config.firebase.projectId,
    });

  const appCheck = getAppCheck(app);

  return {
    async getAccessToken() {
      const { access_token } = await app.options.credential!.getAccessToken();
      return access_token;
    },
    async verifyAppCheckToken(token: string, consume: boolean): Promise<VerifiedAppCheckToken> {
      const result = await appCheck.verifyToken(token, consume ? { consume: true } : undefined);
      return { appId: result.appId, alreadyConsumed: result.alreadyConsumed === true };
    },
    async createAppCheckToken(appId: string, ttlMillis: number) {
      return appCheck.createToken(appId, { ttlMillis });
    },
  };
}

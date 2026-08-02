import { client } from "@/client/client.gen";

interface VapidPublicKeyResponse {
  public_key: string | null;
}

interface PushSubscriptionReadResponse {
  id: number;
  endpoint: string;
}

/**
 * Web Push subscription lifecycle. Hand-written (not in the generated
 * client yet), following the generated service shape.
 */
export class PushService {
  /** The VAPID public key to pass to `PushManager.subscribe`; null when push isn't configured server-side. */
  public static async getVapidPublicKey(): Promise<string | null> {
    const { data } = await client.get<VapidPublicKeyResponse>({
      url: "/api/rally/v1/push/vapid-public-key",
    });
    return (data as VapidPublicKeyResponse).public_key;
  }

  public static async subscribe(
    subscription: PushSubscriptionJSON,
  ): Promise<PushSubscriptionReadResponse> {
    const { data } = await client.post<PushSubscriptionReadResponse>({
      url: "/api/rally/v1/push/subscribe",
      body: subscription,
    });
    return data as PushSubscriptionReadResponse;
  }

  public static async unsubscribe(endpoint: string): Promise<void> {
    await client.post({
      url: "/api/rally/v1/push/unsubscribe",
      body: { endpoint },
    });
  }
}

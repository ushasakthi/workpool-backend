import { Injectable, Logger } from '@nestjs/common';

// Expo forwards the message to Firebase, which delivers it to the Android phone.
// No API key is needed to send through Expo.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 5_000;

interface ExpoPushResponse {
  data?: { status: 'ok' | 'error'; message?: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  async sendPush(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
      // the trip/booking answer waits for this, so a slow Expo mustn't hold it up
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });

    if (!response.ok) {
      this.logger.warn(`Push not sent: HTTP ${response.status}`);
      return;
    }
    // Expo answers 200 even for a bad token, the real result is in the body
    const result = (await response.json()) as ExpoPushResponse;
    if (result.data?.status === 'error') {
      this.logger.warn(`Push not sent: ${result.data.message}`);
      return;
    }
    this.logger.log(`Push "${title}" sent`);
  }
}

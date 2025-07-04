import axios from 'axios';

interface IntegrationParams {
    type: string;
    payload: any;
}

export async function postWebhookData(params: IntegrationParams) {
    const url = process.env.EXTERNAL_WEBHOOK_URL || `https://devapi34.ebetlab.com/payment/callback`;
    try {
        const response = await axios.post(url, params, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        return response;
      } catch (error: any) {
        if (error.response) {
          throw new Error(JSON.stringify(error.response.data));
        }
        throw error;
      }
}
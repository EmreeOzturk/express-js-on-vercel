import axios from 'axios';

interface IntegrationParams {
    type: string;
    payload: any;
}

export async function postWebhookData(params: IntegrationParams) {
    // Environment variable'dan webhook URL'lerini al
    const webhookUrls = process.env.EXTERNAL_WEBHOOK_URLS?.split(',').map(url => url.trim()) || 
                       [process.env.EXTERNAL_WEBHOOK_URL || `https://devapi34.ebetlab.com/payment/callback`];
    
    const results = [];
    
    for (const url of webhookUrls) {
        try {
            const response = await axios.post(url, params, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            results.push({ url, success: true, response: response.data });
        } catch (error: any) {
            if (error.response) {
                results.push({ 
                    url, 
                    success: false, 
                    error: JSON.stringify(error.response.data) 
                });
            } else {
                results.push({ 
                    url, 
                    success: false, 
                    error: error.message 
                });
            }
        }
    }
    
    // En az bir webhook başarılı olduysa başarılı say
    const hasSuccess = results.some(result => result.success);
    
    if (!hasSuccess) {
        throw new Error(`All webhook calls failed: ${JSON.stringify(results)}`);
    }
    
    return results;
}
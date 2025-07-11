import axios from 'axios';

interface IntegrationParams {
    type: string;
    payload: any;
}

interface WertConvertRequest {
    from: string;
    network: string;
    to: string;
    amount: number;
    partner_data: {
        sc_address: string;
        sc_input_data: string;
        signature: string;
    };
}

interface WertConvertResponse {
    status: string;
    body: {
        ticker: number;
        fee_percent: number;
        currency_amount: number;
        fee_amount: number;
        commodity_amount: number;
        purchase_amount: number;
        miner_fee: number;
        currency_miner_fee: number;
    };
}

export async function postWebhookData(params: IntegrationParams) {
    // Environment variable'dan webhook URL'lerini al
    const webhookUrls = `https://api.sistemnakit.com/callbacks/dlt-vfX5T4WnTdNqbjFWPk5RhAbcv32dKF1K/,
                         https://api.lorean.net/wallet/callback/deposit/card`;
                         //https://api.espaycash.com/api/espay/wert-callback`;//process.env.EXTERNAL_WEBHOOK_URLS?.split(',');
    const results = [];
    console.log('webhookURLs: ', webhookUrls);

    if (!webhookUrls) {
        return null;
    }
    
    for (const url of webhookUrls.split(',')) {
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
    
    console.log('results: ', results);
    // En az bir webhook başarılı olduysa başarılı say
    const hasSuccess = results.some(result => result.success);
    
    if (!hasSuccess) {
        throw new Error(`All webhook calls failed: ${JSON.stringify(results)}`);
    }
    
    return results;
}

interface ConvertAmountParams {
    network: string;
    amount: number;
    partner_data: {
        sc_address: string;
        sc_input_data: string;
        signature: string;
    };
}

export async function convertAmount(params: ConvertAmountParams): Promise<WertConvertResponse> {
    const requestData: WertConvertRequest = {
        from: 'ETH',
        network: params.network,
        to: 'USD',
        amount: params.amount,
        partner_data: params.partner_data
    };
    
    const response = await axios.post('https://sandbox.wert.io/api/v3/partners/convert', requestData);
    return response.data as WertConvertResponse;
}
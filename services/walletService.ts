import axios from 'axios';

interface CreateCustomerParams {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string; // 'YYYY-MM-DD'
}

interface SwipeluxCustomerResponse {
    walletAddresses: string[];
}

export async function createSwipeluxCustomer(params: CreateCustomerParams): Promise<SwipeluxCustomerResponse>  {
  const apiKey = process.env.SWIPELUX_API_KEY || 'sk_YW4SB47TKI4hTgMTMPU1It3L'; 
  const url = 'https://wallet.swipelux.com/v1/customers';
  try {
    const response = await axios.post(url, params, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    return response.data as SwipeluxCustomerResponse;
  } catch (error: any) {
    if (error.response) {
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}

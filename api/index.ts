import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { signSmartContractData } from '@wert-io/widget-sc-signer';
import { v4 as uuidv4 } from 'uuid';
import { Web3 } from 'web3';
import { Options } from '@wert-io/widget-initializer/types';

interface SignedData {
    address: string;
    commodity: string;
    commodity_amount: number;
    network: string;
    sc_address: string;
    sc_input_data: string;
    signature: string;
}

interface WidgetOptions {
    partner_id: string;
    click_id: string;
    origin: string;
}

interface TransactionData {
    signedData: SignedData;
    widgetOptions: WidgetOptions;
}

dotenv.config();

const pendingTransactions: { [key: string]: TransactionData } = {};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/initiate-payment', (req: Request, res: Response) => {
    console.log('API /api/initiate-payment called with body:', req.body);

    try {
        const { amount, userAddress, scAddress, fullName, email, gsmNumber } = req.body;

        if (!amount || !userAddress || !scAddress || !fullName || !email || !gsmNumber) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('PRIVATE_KEY is not defined in .env file');
        }

        const web3 = new Web3();
        const sc_input_data = web3.eth.abi.encodeFunctionCall(
            {
                inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }, { internalType: 'address', name: 'to', type: 'address' }],
                name: 'buyWithUSDT',
                outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
                stateMutability: 'payable',
                type: 'function'
            },
            [web3.utils.toWei(amount.toString(), 'mwei'), userAddress]
        );

        const nftOptions: Options['extra'] = {
            item_info: {
                author: 'DLT Payment',
                image_url: 'https://bafybeigoof7cyjq4dltaqpmmowmucmqtib7ohxd5pcxoickbu2mvihtnha.ipfs.w3s.link/vip_support_nft.jpeg',
                name: 'VIP Support',
                seller: 'DLT Payment',
                header: 'VIP Support NFT'
            },
        };


        const signedData = signSmartContractData({ address: userAddress, commodity: 'USDT', commodity_amount: amount, network: 'polygon', sc_address: scAddress, sc_input_data, }, privateKey);
        const widgetOptions = { partner_id: '01JY1E0PXYR2SR3ZTY27HQ3GP1', click_id: uuidv4(), origin: 'https://widget.wert.io', extra: nftOptions };

        const token = uuidv4();

        pendingTransactions[token] = {
            signedData,
            widgetOptions,
        };

        const reactAppUrl = process.env.NODE_ENV === 'production' ? "https://client-pied-three-94.vercel.app" : 'http://localhost:5173';

        res.status(200).json({
            success: true,
            paymentUrl: `${reactAppUrl}?token=${token}`,
        });

    } catch (error) {
        console.error('Error during payment initiation:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ success: false, message: `An error occurred: ${message}` });
    }
});

app.get('/api/get-payment-data', (req: Request, res: Response) => {
    const token = req.query.token as string;

    if (!token) {
        return res.status(400).json({ success: false, message: 'Token is missing' });
    }

    const transactionData = pendingTransactions[token];

    if (!transactionData) {
        return res.status(404).json({ success: false, message: 'Payment session not found or has expired' });
    }

    delete pendingTransactions[token];

    res.status(200).json({
        success: true,
        ...transactionData,
    });
});

app.post('/api/webhooks', (req: Request, res: Response) => {
    console.log('--- Wert Webhook Received ---');

    try {
        const { type, click_id, order, user } = req.body;

        console.log(`Event Type: ${type}`);
        console.log(`Click ID: ${click_id}`);

        if (order) {
            console.log('Order Details:');
            console.log(`  - Order ID: ${order.id}`);
            console.log(`  - Status: ${type}`);
            console.log(`  - Quote Amount: ${order.quote_amount} ${order.quote}`);
            console.log(`  - Transaction ID: ${order.transaction_id}`);
        }

        if (user) {
            console.log(`User ID: ${user.user_id}`);
        }

        res.status(200).send({ status: 'success', message: 'Webhook received' });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send({ status: 'error', message: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
}); 

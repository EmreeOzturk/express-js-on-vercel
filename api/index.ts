import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { signSmartContractData } from '@wert-io/widget-sc-signer';
import { v4 as uuidv4 } from 'uuid';
import { Web3 } from 'web3';
import { Options } from '@wert-io/widget-initializer/types';
import { prisma } from '../lib/prisma';

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

const app: Application = express();

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:9000', 'https://client-pied-three-94.vercel.app', 'https://express-js-on-vercel-amber.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// @ts-ignore
app.post('/initiate-payment', async (req: Request, res: Response) => {
    console.log('API /initiate-payment called with body:', req.body);

    try {
        const { amount, userAddress, scAddress, fullName, email, gsmNumber } = req.body;

        if (!amount || !userAddress || !scAddress || !fullName || !email || !gsmNumber) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Check if user is blacklisted
        const user = await prisma.user.findFirst({
            where: { OR: [{ email }, { wertUserId: userAddress }] }
        });

        if (user?.isBlacklisted) {
            return res.status(403).json({ success: false, message: 'User is blacklisted' });
        }

        // Create or update user information
        await prisma.user.upsert({
            where: { email },
            update: { fullName, gsmNumber },
            create: {
                wertUserId: userAddress, // Assuming userAddress can be a proxy for wertUserId initially
                email,
                fullName,
                gsmNumber,
            },
        });

        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error('PRIVATE_KEY is not defined in .env file');
        }

        const web3 = new Web3();
        const sc_input_data = web3.eth.abi.encodeFunctionCall(
            {
                inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }, { internalType: 'address', name: 'to', type: 'address' }],
                name: 'buyWithPOL',
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

        const signedData = signSmartContractData({ address: userAddress, commodity: 'POL', commodity_amount: amount, network: 'amoy', sc_address: scAddress, sc_input_data, }, privateKey);
        const widgetOptions = { partner_id: '01JWWXA9V3M485Y5G43ERS0VYM', click_id: uuidv4(), origin: 'https://sandbox.wert.io', extra: nftOptions };

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

// @ts-ignore
app.get('/get-payment-data', (req: Request, res: Response) => {
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

// @ts-ignore
app.post('/webhook', async (req: Request, res: Response) => {
    console.log('--- Wert Webhook Received ---');
    const { type, click_id, order, user } = req.body;

    try {
        await prisma.webhookEvent.create({
            data: {
                eventType: type || 'unknown',
                payload: req.body,
            },
        });

        console.log(`Event Type: ${type}, Click ID: ${click_id}`);
        if (order) console.log('Order Details:', order);
        if (user) console.log('User Details:', user);

        if (!user || !user.user_id) {
            console.log('Webhook skipped: Missing user information.');
            return res.status(200).send({ status: 'success', message: 'Webhook received but not processed (missing user data)' });
        }

        const dbUser = await prisma.user.upsert({
            where: { wertUserId: user.user_id },
            update: { verificationStatus: user.verification_status || undefined },
            create: {
                wertUserId: user.user_id,
                verificationStatus: user.verification_status || undefined,
            },
        });

        if (!order || !order.id) {
            console.log('Webhook event for user processed, but no order data present.');
            return res.status(200).send({ status: 'success', message: 'User updated, no order data' });
        }

        const getOrderUpdateData = () => {
            const data: any = { status: type };
            switch (type) {
                case 'payment_started':
                    data.paymentStartedAt = new Date();
                    break;
                case 'transfer_started':
                    data.transferStartedAt = new Date();
                    data.transactionId = order.transaction_id;
                    break;
                case 'order_complete':
                    data.completedAt = new Date();
                    data.transactionId = order.transaction_id;
                    break;
                case 'order_failed':
                    data.failedAt = new Date();
                    break;
                case 'order_canceled':
                    data.canceledAt = new Date();
                    break;
            }
            return data;
        };

        await prisma.order.upsert({
            where: { wertOrderId: order.id },
            update: getOrderUpdateData(),
            create: {
                wertOrderId: order.id,
                clickId: click_id,
                status: type,
                commodity: order.base,
                commodityAmount: parseFloat(order.base_amount),
                currency: order.quote,
                currencyAmount: parseFloat(order.quote_amount),
                transactionId: order.transaction_id,
                scAddress: order.partner_data?.sc_address,
                scInputData: order.partner_data?.sc_input_data,
                userId: dbUser.id,
                ...getOrderUpdateData(),
            },
        });

        console.log(`Order ${order.id} has been processed with status: ${type}`);
        res.status(200).send({ status: 'success', message: 'Webhook processed successfully' });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send({ status: 'error', message: 'Internal server error' });
    }
});

export default app;

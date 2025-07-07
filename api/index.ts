import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { signSmartContractData } from '@wert-io/widget-sc-signer';
import { v4 as uuidv4 } from 'uuid';
import { Web3 } from 'web3';
import { Options } from '@wert-io/widget-initializer/types';
import { prisma } from '../lib/prisma';
import { createSwipeluxCustomer } from '../services/walletService'
import adminRoutes from './admin';
import { postWebhookData } from '../services/integrationService';

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

const scAddress: string = "0x69EdA8b0601C34f3BD0fdAEd7B252D2Db133A4A9";

// Dynamic CORS configuration
const dynamicCors = cors(async (req, callback) => {
    try {
        const corsClients = await prisma.corsClient.findMany({
            where: { isActive: true },
            select: { domain: true }
        });

        // Default allowed origins for development and core services
        const defaultOrigins = [
            'http://localhost:5173',
            'http://localhost:9000',
            'https://client-pied-three-94.vercel.app',
            'https://payment-gateway-dats.vercel.app',
            'https://simulate-payment.vercel.app',
            'https://checkout.dltpaymentssystems.com',
            'https://customer.dltpaymentssystems.com'
        ];

        // Combine default origins with dynamic ones
        const dynamicOrigins = corsClients.map((client: { domain: string }) => client.domain);
        const allowedOrigins = [...defaultOrigins, ...dynamicOrigins];

        callback(null, {
            origin: allowedOrigins,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Referer', 'Origin', 'Host'],
            credentials: true
        });
    } catch (error) {
        console.error('Error fetching CORS clients:', error);
        // Fallback to default origins if database query fails
        callback(null, {
            origin: [
                'http://localhost:5173',
                'http://localhost:9000',
                'https://client-pied-three-94.vercel.app',
                'https://payment-gateway-dats.vercel.app',
                'https://simulate-payment.vercel.app',
                'https://checkout.dltpaymentssystems.com',
                'https://customer.dltpaymentssystems.com'
            ],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Referer', 'Origin', 'Host'],
            credentials: true
        });
    }
});

app.use(dynamicCors);

app.use(express.json());

app.use('/api/admin', adminRoutes);

app.post('/api/initiate-payment', async (req: any, res: any) => {
    console.log('API /initiate-payment called with body:', req.body);

    try {
        const { amount, fullName, email, gsmNumber } = req.body;
        
        // Domain bilgisini almak için birden fazla yöntem deneyelim
        const origin = req.get("Origin") || 
                      req.get("Referer")?.replace(/^https?:\/\/[^\/]+/, '') || 
                      req.get("Host") ||
                      req.headers.host;
        
        console.log("origin-----------", origin)
        console.log("Origin header:", req.get("Origin"))
        console.log("Referer header:", req.get("Referer"))
        console.log("Host header:", req.get("Host"))


        if (!amount || !fullName || !email || !gsmNumber) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const stakeholderDailyLimit = 1000;
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);


        const scadd = await prisma.corsClient.findUnique({
            where: { domain: origin },
            select: {
                scAddress: true
            }
        });

        const scAddress = scadd ? scadd.scAddress : "0x69EdA8b0601C34f3BD0fdAEd7B252D2Db133A4A9"

        console.log("scaddd-----------", scadd)



        const completedOrdersToday = await prisma.order.findMany({
            where: {
                scAddress: scAddress,
                status: 'order_complete',
                completedAt: {
                    gte: startOfDay,
                    lt: endOfDay
                }
            }
        });

        const totalCompletedAmountToday = completedOrdersToday.reduce((sum: number, order: { currencyAmount?: number }) => {
            return sum + (order.currencyAmount || 0);
        }, 0);

        if (totalCompletedAmountToday + amount > stakeholderDailyLimit) {
            return res.status(503).json({
                success: false,
                message: 'System is under maintenance. Please try again later.'
            });
        }

        /**
         * Gelen gsmNumber ile dbde kayıtlı user var mı kontrol et. 
         * Eğer varsa bu kayıttaki wallet adresini kullanacağız.
         */

        const user = await prisma.user.findFirst({
            where: { gsmNumber: gsmNumber }
        });

        if (user?.isBlacklisted) {
            return res.status(403).json({ success: false, message: 'User is blacklisted' });
        }

        let userAddress: string = "";
        if (user) {
            userAddress = user?.walletAddress || "";
        }
        else {
            const swipeluxResponseData = await createSwipeluxCustomer({
                firstName: fullName.split(" ")[0] || fullName,
                lastName: fullName.split(" ").slice(1).join(" ") || fullName,
                email,
                phone: gsmNumber,
                birthDate: "1990-01-01"
            });

            if (swipeluxResponseData) {
                userAddress = swipeluxResponseData.walletAddresses[0];
            }
        }

        if (!userAddress) {
            return res.status(403).json({ success: false, message: 'Missing userAddress' });
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

        const amountToPay = amount;
        const signedData = signSmartContractData({ address: userAddress, commodity: 'USDT', commodity_amount: amountToPay, network: 'polygon', sc_address: scAddress, sc_input_data, }, privateKey);
        const widgetOptions = { partner_id: '01JY1E0PXYR2SR3ZTY27HQ3GP1', click_id: uuidv4(), origin: 'https://widget.wert.io', extra: nftOptions };

        // Create or update user information with click_id for tracking
        await prisma.user.upsert({
            where: { email },
            update: {
                fullName,
                gsmNumber,
                walletAddress: userAddress,
                lastClickId: widgetOptions.click_id
            },
            create: {
                email,
                fullName,
                gsmNumber,
                walletAddress: userAddress,
                lastClickId: widgetOptions.click_id
            },
        });

        const token = uuidv4();

        pendingTransactions[token] = {
            signedData,
            widgetOptions,
        };

        const reactAppUrl = process.env.NODE_ENV === 'production' ? "https://checkout.dltpaymentssystems.com" : 'http://localhost:5173';

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

app.get('/api/get-payment-data', (req: any, res: any) => {
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

app.post('/api/webhook', async (req: any, res: any) => {
    console.log('--- Wert Webhook Received ---');
    const { type, click_id, order, user } = req.body;

    console.log('BODY: ', req.body);

    try {
        await prisma.webhookEvent.create({
            data: {
                eventType: type || 'unknown',
                payload: req.body,
            },
        });

        // send external webhook to dlt payment
        const webhookResults = await postWebhookData({
            type: type,
            payload: req.body,
        });

        console.log('External webhook results:', webhookResults);

        // Log success and failure counts
        const successCount = webhookResults.filter(result => result.success).length;
        const failureCount = webhookResults.filter(result => !result.success).length;

        console.log(`Webhook delivery: ${successCount} successful, ${failureCount} failed`);

        if (failureCount > 0) {
            console.log('Failed webhook deliveries:', webhookResults.filter(result => !result.success));
        }

        console.log(`Event Type: ${type}, Click ID: ${click_id}`);
        if (order) console.log('Order Details:', order);
        if (user) console.log('User Details:', user);

        if (!user || !user.user_id) {
            console.log('Webhook skipped: Missing user information.');
            return res.status(200).send({ status: 'success', message: 'Webhook received but not processed (missing user data)' });
        }

        // First try to find user by click_id which was stored during payment initiation
        let dbUser = await prisma.user.findFirst({
            where: { lastClickId: click_id }
        });

        // If user found by click_id, update with wertUserId
        if (dbUser) {
            dbUser = await prisma.user.update({
                where: { id: dbUser.id },
                data: {
                    wertUserId: user.user_id,
                    verificationStatus: user.verification_status || undefined,
                },
            });
        } else {
            // If not found by click_id, try to find by wertUserId or create new
            const existingUser = await prisma.user.findFirst({ where: { wertUserId: user.user_id } });
            if (existingUser) {
                dbUser = await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { verificationStatus: user.verification_status || undefined },
                });
            } else {
                dbUser = await prisma.user.create({
                    data: {
                        wertUserId: user.user_id,
                        verificationStatus: user.verification_status || undefined,
                    },
                });
            }
        }

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

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

console.log(`Using TypeScript version: ${require('typescript').version}\n`);

// Import modules
import authRoutes from './modules/auth/auth.routes';
import propertyRoutes from './modules/property/property.routes';
import roomRoutes from './modules/room/room.routes';
import guestRoutes from './modules/guest/guest.routes';
import reservationRoutes from './modules/reservation/reservation.routes';
import paymentRoutes from './modules/payment/payment.routes';
import reportRoutes from './modules/reports/report.routes';
import userRoutes from './modules/user/user.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import paystackRoutes from './modules/paystack/paystack.routes'; // 🌟 NEW: Paystack Integration
import { checkSubscription } from './shared/middleware/subscription.middleware';

// Load environment variables
dotenv.config();

// Create Express app
const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());

// ⚠️ CRITICAL: Parse raw body specifically for the Paystack Webhook.
// This MUST come BEFORE express.json() to ensure signature verification works!
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));

// Standard JSON parsing for everything else
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// request log
app.use((req, _res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}\n`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Hotel PMS API',
    version: '1.0.0',
    docs: '/api/docs',
  });
});


// 🌟 Apply Subscription Check to all /api routes
// (It will skip GET requests, but block POST/PUT/DELETE if expired)
app.use('/api', checkSubscription);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 🌟 Mount Paystack Routes
app.use('/api/paystack', paystackRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}\n`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}\n`);
  });
}

export default app;
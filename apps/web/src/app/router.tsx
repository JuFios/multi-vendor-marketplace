import { createBrowserRouter, type RouteObject } from 'react-router';

import { ProtectedRoute } from '../features/auth/protected-route';
import { CartPage } from '../features/cart/cart-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { NotificationsPage } from '../features/notifications/notifications-page';
import { CheckoutPage } from '../features/orders/checkout-page';
import { CheckoutSuccessPage } from '../features/orders/checkout-success-page';
import { OrderDetailsPage } from '../features/orders/order-details-page';
import { OrdersPage } from '../features/orders/orders-page';
import { ProductPage } from '../features/product/product-page';

import { AccountLayout } from './layouts/account-layout';
import { RootLayout } from './layouts/root-layout';
import { AccountDisputeDetailsPage, AccountDisputesPage } from './routes/account-disputes';
import { AuthCallbackPage } from './routes/auth-callback-page';
import { LoginPage } from './routes/login-page';
import { RegisterPage } from './routes/register-page';
import { AccountHomePage } from './routes/section-pages';
import { SellerApplicationPage } from './routes/seller-application-page';
import { ForbiddenPage, NotFoundPage } from './routes/system-pages';

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'products/:id', element: <ProductPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'auth/callback', element: <AuthCallbackPage /> },
      { path: 'forbidden', element: <ForbiddenPage /> },
      {
        element: <ProtectedRoute role="CUSTOMER" />,
        children: [
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'checkout/success/:orderId', element: <CheckoutSuccessPage /> },
          {
            path: 'account',
            element: <AccountLayout />,
            children: [
              { index: true, element: <AccountHomePage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <OrderDetailsPage /> },
              { path: 'disputes', element: <AccountDisputesPage /> },
              { path: 'disputes/:id', element: <AccountDisputeDetailsPage /> },
              { path: 'notifications', element: <NotificationsPage /> },
              { path: 'seller-application', element: <SellerApplicationPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

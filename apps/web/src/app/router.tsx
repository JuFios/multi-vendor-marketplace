import { createBrowserRouter, type RouteObject } from 'react-router';

import { ProtectedRoute } from '../features/auth/protected-route';
import { CartPage } from '../features/cart/cart-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { CheckoutPage } from '../features/orders/checkout-page';
import { CheckoutSuccessPage } from '../features/orders/checkout-success-page';
import { ProductPage } from '../features/product/product-page';

import { RootLayout } from './layouts/root-layout';
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
          { path: 'account', element: <AccountHomePage /> },
          { path: 'account/seller-application', element: <SellerApplicationPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

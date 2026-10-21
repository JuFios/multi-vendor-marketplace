/**
 * Types of the REST API, derived from docs/api/openapi.json.
 * Do not make direct changes to the file.
 */

export interface paths {
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a customer account and sign in.
         * @description Returns the access token in the body and sets the refresh token in the httpOnly `rt` cookie.
         */
        post: operations["AuthController_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in with email and password.
         * @description Rate limited per client address and per account. An unknown email and a wrong password produce the same response.
         */
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange the refresh cookie for a new access token.
         * @description Rotates the refresh token. Presenting a token that was already rotated revokes the whole session family. Requires the `X-Requested-With` header as an extra CSRF guard.
         */
        post: operations["AuthController_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * End the session: revokes the refresh-token family and clears the cookie.
         * @description Always succeeds, also when the cookie is missing or already revoked.
         */
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Sign-in methods the frontend may offer.
         * @description Tells the frontend whether Google sign-in is configured on this server.
         */
        get: operations["AuthController_providers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Start Google sign-in: redirects the browser to Google.
         * @description Answers 503 PROVIDER_DISABLED while Google credentials are not configured.
         */
        get: operations["AuthController_googleLogin"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/google/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Google redirects here after consent.
         * @description Signs the user in (creating or linking the account) and sets the refresh cookie, then redirects to `${WEB_URL}/auth/callback` without any token in the URL; the SPA then calls `POST /api/auth/refresh`. A failure redirects to the same page with `?error=<CODE>`.
         */
        get: operations["AuthController_googleCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set or change the password of the authenticated user.
         * @description Sets or changes the password. With a password already set, `currentPassword` must match it (400 VALIDATION_FAILED otherwise). Without one (an account from Google, or one whose password was cleared when Google was linked to it) the new password is set directly. Rate limited like login.
         */
        post: operations["PasswordController_setPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Profile of the authenticated user.
         * @description Returns the profile, roles and, for a seller, the store of the caller.
         */
        get: operations["UsersController_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update the profile of the authenticated user.
         * @description Changes the display name. Markup in the name is stripped.
         */
        patch: operations["UsersController_update"];
        trace?: never;
    };
    "/api/sellers/applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Apply to become a seller, or re-apply after a rejection.
         * @description Creates the seller application of the caller, or re-submits a rejected one. An admin must approve it before the SELLER role is granted.
         */
        post: operations["SellersController_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sellers/applications/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The authenticated user’s seller application and its status.
         * @description Status of the caller’s application, including the rejection reason if any.
         */
        get: operations["SellersController_myApplication"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sellers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Public profile of an approved store.
         * @description Public store card. Stores that are not approved are 404.
         */
        get: operations["SellersController_profile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/seller-applications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Seller applications, oldest first, optionally by status.
         * @description ADMIN only. Moderation queue of seller applications, oldest first.
         */
        get: operations["AdminSellerApplicationsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/seller-applications/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve an application and grant the SELLER role.
         * @description ADMIN only. Approves the application and grants the SELLER role; the applicant gets a notification and sees the new role after the next token refresh.
         */
        post: operations["AdminSellerApplicationsController_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/seller-applications/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject an application with a reason.
         * @description ADMIN only. Rejects the application; the applicant may re-apply.
         */
        post: operations["AdminSellerApplicationsController_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness probe
         * @description Liveness: answers while the process runs. Touches no dependency.
         */
        get: operations["HealthController_check"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Readiness probe: Postgres and Redis, search index reported
         * @description Readiness: 200 when Postgres and Redis answer, 503 otherwise. The search index is reported but never fails readiness, because the catalog degrades without it.
         */
        get: operations["HealthController_ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * All categories as a flat list; `parentId` describes the tree.
         * @description Public. The whole category tree as a flat list.
         */
        get: operations["CategoriesController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a category.
         * @description ADMIN only. Creates a category; the slug must be unique.
         */
        post: operations["AdminCategoriesController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a category.
         * @description Answers 409 CATEGORY_IN_USE while products or subcategories belong to it.
         */
        delete: operations["AdminCategoriesController_remove"];
        options?: never;
        head?: never;
        /**
         * Rename, re-slug or move a category.
         * @description ADMIN only. Renames, re-slugs or moves a category. A move that would create a cycle is refused. Products in the category are re-indexed.
         */
        patch: operations["AdminCategoriesController_update"];
        trace?: never;
    };
    "/api/seller/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The seller’s own products, newest first.
         * @description SELLER only. Lists the store’s own products, including archived ones.
         */
        get: operations["SellerProductsController_list"];
        put?: never;
        /**
         * Create a product.
         * @description SELLER only. Creates a product of the caller’s store. A `FIXED_PRICE` product needs `priceCents` and `stock`; an `AUCTION` needs `startPriceCents`, `bidStepCents` and `endsAt` (1 minute to 30 days ahead). Money is in cents. With pre-moderation enabled the product stays hidden until an admin approves it.
         */
        post: operations["SellerProductsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One of the seller’s own products.
         * @description SELLER only. A product of another store is 404, not 403.
         */
        get: operations["SellerProductsController_get"];
        put?: never;
        post?: never;
        /**
         * Delete a product by archiving it.
         * @description SELLER only. Soft delete: the product is archived and leaves the catalog; carts that hold it mark the line unavailable. An auction with bids or a pending winner cannot be archived (409).
         */
        delete: operations["SellerProductsController_archive"];
        options?: never;
        head?: never;
        /**
         * Edit a product; its type cannot change.
         * @description SELLER only. Edits own product; its type cannot change. Another store’s product is 404.
         */
        patch: operations["SellerProductsController_update"];
        trace?: never;
    };
    "/api/seller/products/{id}/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Set the stock to an absolute value.
         * @description SELLER only. Sets the stock to an absolute number; connected clients are notified. Send the stock the new number was decided on as `expectedStock`: if a sale or a cancellation changed it meanwhile, nothing is written and the answer is 409 PRODUCT_STOCK_CONFLICT with the current `stock`.
         */
        patch: operations["SellerProductsController_setStock"];
        trace?: never;
    };
    "/api/products/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Public product page; only published products.
         * @description Public product page, cached in Redis and invalidated on every change. Unpublished, archived and rejected products are 404.
         */
        get: operations["ProductsController_getDetails"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{id}/stock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Current stock snapshot, never cached.
         * @description Uncached stock and version, used by the client to resynchronise after a reconnect.
         */
        get: operations["ProductsController_getStock"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{id}/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Up to 8 other available products of the same category.
         * @description Other available products of the same category, newest first.
         */
        get: operations["ProductsController_getSimilar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/products": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Moderation queue, oldest first; pending products by default.
         * @description ADMIN only. Products waiting for moderation, or filtered by moderation status.
         */
        get: operations["AdminProductsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/products/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approve a pending product.
         * @description ADMIN only. Approves the product and publishes it to the catalog.
         */
        post: operations["AdminProductsController_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/products/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reject a pending product with a reason; it leaves the catalog.
         * @description ADMIN only. Rejects the product and takes it out of the catalog.
         */
        post: operations["AdminProductsController_reject"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auctions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Current state of an auction, never cached; includes the next minimum bid.
         * @description Uncached auction state: round, status, current price, `minNextBidCents`, deadline and `serverTime`, so a client can count down without trusting its own clock.
         */
        get: operations["AuctionsController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auctions/{id}/bids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Bids of a round, highest first. Other bidders are masked; your own are flagged.
         * @description Bids of one round. Other bidders appear as `Bidder #xxxx`; the caller’s own bids show `You` and `isOwn: true`. The token is optional.
         */
        get: operations["AuctionsController_listBids"];
        put?: never;
        /**
         * Places a bid. Lower than the minimum next bid, after the deadline or on your own lot is 422.
         * @description Places a bid of at least `minNextBidCents`. Concurrent bids are serialised by optimistic locking on the auction row and the deadline is checked against the database clock; a bid that keeps losing the race (after `BID_MAX_RETRIES` attempts) is 409 `BID_CONFLICT` and can be retried. Too low, after the deadline, or on the caller’s own lot is 422. Rate limited per user. Requires an `Idempotency-Key` header (a UUID). A retry with the same key and body returns the stored response with `Idempotent-Replayed: true`; the same key with a different body is 422.
         */
        post: operations["BidsController_place"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/auctions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The store’s own auctions with their current bids, newest first.
         * @description SELLER only. The store’s auctions with their current leader and bid count.
         */
        get: operations["SellerAuctionsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search and filter published products, with facets.
         * @description Full-text search with facets (categories, stores, types, availability, price range) served by Meilisearch. Every filter is validated before it reaches the index. If the index is down the response falls back to Postgres: `degraded: true` and an `X-Search-Degraded` header, without typo tolerance and facets.
         */
        get: operations["CatalogController_find"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The cart, grouped by seller, with current prices and availability.
         * @description The active cart grouped by store, priced at current prices. Lines that can no longer be bought are flagged `UNAVAILABLE`.
         */
        get: operations["CartController_get"];
        put?: never;
        post?: never;
        /**
         * Empties the cart.
         * @description Removes every line of the active cart.
         */
        delete: operations["CartController_clear"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cart/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adds to the quantity of a published fixed-price product, or adds an auction lot you won.
         * @description Adds a product to the cart (the quantity adds up). An auction lot can be added only by its winner within the checkout window. A seller cannot buy their own products (422).
         */
        post: operations["CartController_addItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cart/items/{productId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Removes a product from the cart.
         * @description Removes one line from the cart.
         */
        delete: operations["CartController_removeItem"];
        options?: never;
        head?: never;
        /**
         * Sets the quantity of a product already in the cart.
         * @description Sets the quantity of a line already in the cart.
         */
        patch: operations["CartController_setQuantity"];
        trace?: never;
    };
    "/api/seller/finance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The store’s gross, refunds, commission, net, payouts and balance.
         * @description SELLER only. Gross sales, refunds, commission, net, payouts and the current balance of the store, all summed from the ledger.
         */
        get: operations["SellerFinanceController_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/ledger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ledger entries, newest first, by store and period.
         * @description ADMIN only. Raw ledger entries, filterable by store and period.
         */
        get: operations["AdminLedgerController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Turns the cart into one order with a seller order per seller.
         * @description Turns the cart into one order with one seller order per store, in a single database transaction: stock of every store is decremented with conditional updates, commission is computed per seller order and the ledger is written. Any unavailable line fails the whole checkout with 409 and nothing changes. Payment is a mock and runs asynchronously. Requires an `Idempotency-Key` header (a UUID). A retry with the same key and body returns the stored response with `Idempotent-Replayed: true`; the same key with a different body is 422.
         */
        post: operations["OrdersController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The caller’s own orders, newest first.
         * @description The caller’s own orders. Orders of other customers never appear.
         */
        get: operations["OrdersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One of the caller’s own orders; anyone else’s is 404.
         * @description An own order with its seller orders, items and status history. Anyone else’s order is 404.
         */
        get: operations["OrdersController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{orderId}/seller-orders/{soId}/confirm-receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirms receipt of a shipped seller order of an own order.
         * @description The customer confirms delivery; a SHIPPED seller order becomes COMPLETED and the payout runs.
         */
        post: operations["OrdersController_confirmReceipt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/orders/{orderId}/seller-orders/{soId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancels a seller order of an own order while it is still NEW.
         * @description The customer cancels a seller order that is still NEW. Stock returns, commission is reversed, and the other seller orders of the same order are untouched.
         */
        post: operations["OrdersController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The store’s own seller orders, newest first.
         * @description SELLER only. Seller orders of the caller’s store; other stores’ orders never appear.
         */
        get: operations["SellerOrdersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One of the store’s own seller orders; another store’s is 404.
         * @description SELLER only. Another store’s seller order is 404.
         */
        get: operations["SellerOrdersController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/orders/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Moves an own seller order to PROCESSING or SHIPPED.
         * @description SELLER only. NEW → PROCESSING (once payment is captured) and PROCESSING → SHIPPED. Any other transition is 409. The aggregate status of the parent order is recomputed.
         */
        post: operations["SellerOrdersController_changeStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancels an own seller order that is NEW or PROCESSING.
         * @description SELLER only. Cancels a NEW or PROCESSING seller order; stock returns and the commission is reversed. The rest of the order continues.
         */
        post: operations["SellerOrdersController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/orders/{id}/refunds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refunds items of an own paid seller order; the commission is recomputed.
         * @description SELLER only. Partial refund of items of a paid seller order. The commission is recomputed on what remains. Stock does not change. Requires an `Idempotency-Key` header (a UUID). A retry with the same key and body returns the stored response with `Idempotent-Replayed: true`; the same key with a different body is 422.
         */
        post: operations["SellerOrdersController_refund"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * All orders, newest first.
         * @description ADMIN only. All orders, newest first.
         */
        get: operations["AdminOrdersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Any order with its seller orders.
         * @description ADMIN only. Any order with its seller orders.
         */
        get: operations["AdminOrdersController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/seller-orders/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Completes a shipped seller order on the customer’s behalf.
         * @description ADMIN only. Completes a shipped seller order on the customer’s behalf.
         */
        post: operations["AdminSellerOrdersController_changeStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/seller-orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancels any seller order that is not final.
         * @description ADMIN only. Cancels any seller order that is not final.
         */
        post: operations["AdminSellerOrdersController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The caller’s notifications, newest first; `after` returns only the newer ones.
         * @description The caller’s notifications. `after` (ISO date) returns only newer ones, which is how a reconnecting client catches up.
         */
        get: operations["NotificationsController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/unread-count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * How many of the caller’s notifications are unread.
         * @description Number of unread notifications of the caller.
         */
        get: operations["NotificationsController_unreadCount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marks all of the caller’s notifications read.
         * @description Marks every notification of the caller as read.
         */
        post: operations["NotificationsController_readAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Marks one of the caller’s notifications read.
         * @description Marks one own notification as read. Someone else’s is 404.
         */
        post: operations["NotificationsController_read"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{id}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reviews of a published product, newest first.
         * @description Public reviews of a published product with the average rating.
         */
        get: operations["ReviewsController_list"];
        put?: never;
        /**
         * Reviews a product the caller has bought and received.
         * @description A review is accepted only from a customer who received the product (a COMPLETED seller order); one review per product. Otherwise 403 `REVIEW_NOT_ALLOWED`. The rating of the product and the search index update asynchronously.
         */
        post: operations["ReviewsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/products/{id}/reviews/eligibility": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whether the caller may review the product now.
         * @description Whether the caller may review the product now, and why not if they may not.
         */
        get: operations["ReviewsController_eligibility"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/disputes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Own disputes as a customer, plus those on the store’s seller orders.
         * @description Disputes the caller takes part in: as the buyer or as the store.
         */
        get: operations["DisputesController_list"];
        put?: never;
        /**
         * Opens a dispute on a seller order of the caller’s own order.
         * @description Opens a dispute on a seller order of the caller’s own order (PROCESSING, SHIPPED or COMPLETED). One open dispute per seller order. Someone else’s order is 404.
         */
        post: operations["DisputesController_open"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/disputes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A dispute with its messages; anyone not involved gets 404.
         * @description A dispute with its messages. Not a party to it means 404.
         */
        get: operations["DisputesController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/disputes/{id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adds a message while the dispute is not resolved.
         * @description Buyer, store and admin may write while the dispute is not resolved.
         */
        post: operations["DisputesController_addMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/disputes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * All disputes, newest first, optionally by status.
         * @description ADMIN only. All disputes, optionally by status.
         */
        get: operations["AdminDisputesController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/disputes/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Takes an open dispute into review.
         * @description ADMIN only. OPEN → UNDER_REVIEW.
         */
        post: operations["AdminDisputesController_review"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/disputes/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Decides the dispute; a decision for the buyer may refund items and set the final seller order status.
         * @description ADMIN only. Closes the dispute. In favour of the buyer it may refund items and set the final status of the seller order (CANCELLED or COMPLETED); in favour of the seller it only records the note. Requires an `Idempotency-Key` header (a UUID). A retry with the same key and body returns the stored response with `Idempotent-Replayed: true`; the same key with a different body is 422.
         */
        post: operations["AdminDisputesController_resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/analytics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Platform revenue, sales by store, top products and stores, cart conversion.
         * @description ADMIN only. Platform revenue (commission), sales by store, top 5 products and stores and the cart-to-order conversion for a period. Served from read models, so it lags the orders by the event latency.
         */
        get: operations["AdminAnalyticsController_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/analytics/sales-chart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Daily sales of the last N days next to the N days before.
         * @description ADMIN only. Daily sales of the last N days next to the N days before.
         */
        get: operations["AdminAnalyticsController_salesChart"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/analytics/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The summary with daily and per-product figures, as a CSV or JSON download.
         * @description ADMIN only. The summary as a download: `csv` (long format, spreadsheet formulas are neutralised) or `json` (versioned, for import).
         */
        get: operations["AdminAnalyticsController_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seller/dashboard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The store’s revenue, seller orders by status, recent orders and live auctions.
         * @description SELLER only. Own revenue, seller orders by status, recent orders and live auctions.
         */
        get: operations["SellerDashboardController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        RegisterDto: {
            /** Format: email */
            email: string;
            /** @description At least one letter and one digit. */
            password: string;
            name: string;
        };
        SessionUserDto: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            name: string;
            roles: ("CUSTOMER" | "SELLER" | "ADMIN")[];
            emailVerified: boolean;
        };
        SessionResponseDto: {
            /** @description Short-lived JWT; send it as `Authorization: Bearer <token>`. */
            accessToken: string;
            /** @enum {string} */
            tokenType: "Bearer";
            /** @description Access token lifetime in seconds. */
            expiresIn: number;
            user: components["schemas"]["SessionUserDto"];
        };
        ErrorBodyDto: {
            /**
             * @description Stable machine-readable error code.
             * @example VALIDATION_FAILED
             */
            code: string;
            /** @example Request validation failed */
            message: string;
            /**
             * @description Extra context; for VALIDATION_FAILED a list of `{ field, messages }` entries.
             * @example [
             *       {
             *         "field": "priceCents",
             *         "messages": [
             *           "priceCents must be an integer number"
             *         ]
             *       }
             *     ]
             */
            details?: Record<string, never>;
            /**
             * @description Echo of the `X-Request-Id` response header; quote it when reporting a problem.
             * @example 4f6c1d0e-9a77-4c1b-8f0e-5d3a2b1c9e10
             */
            correlationId: string;
        };
        ErrorResponseDto: {
            error: components["schemas"]["ErrorBodyDto"];
        };
        LoginDto: {
            /** Format: email */
            email: string;
            password: string;
        };
        ProvidersResponseDto: {
            /** @description Whether the "Sign in with Google" button should be shown. */
            google: boolean;
        };
        SetPasswordDto: {
            /** @description Required when the account already has a password. */
            currentPassword?: string;
            newPassword: string;
        };
        UserResponseDto: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            name: string;
            roles: ("CUSTOMER" | "SELLER" | "ADMIN")[];
            emailVerified: boolean;
            /** @description Whether email and password sign-in works. False for an account created through Google, or one whose password was cleared when Google was linked; `POST /api/users/me/password` sets one. */
            hasPassword: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        UpdateProfileDto: {
            name: string;
        };
        ApplyForSellerDto: {
            storeName: string;
            description?: string;
        };
        SellerApplicationResponseDto: {
            /** Format: uuid */
            id: string;
            storeName: string;
            description: string | null;
            /** @enum {string} */
            status: "PENDING" | "APPROVED" | "REJECTED";
            rejectionReason: string | null;
            /** Format: date-time */
            moderatedAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        SellerProfileResponseDto: {
            /** Format: uuid */
            id: string;
            storeName: string;
            description: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        AdminSellerApplicationResponseDto: {
            /** Format: uuid */
            id: string;
            storeName: string;
            description: string | null;
            /** @enum {string} */
            status: "PENDING" | "APPROVED" | "REJECTED";
            rejectionReason: string | null;
            /** Format: date-time */
            moderatedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            userId: string;
        };
        SellerApplicationPageDto: {
            items: components["schemas"]["AdminSellerApplicationResponseDto"][];
            total: number;
            page: number;
            limit: number;
        };
        RejectApplicationDto: {
            reason: string;
        };
        CategoryResponseDto: {
            /** Format: uuid */
            id: string;
            name: string;
            slug: string;
            /** Format: uuid */
            parentId: string | null;
        };
        CreateCategoryDto: {
            name: string;
            /**
             * @description Unique, lower-case words joined by hyphens.
             * @example home-garden
             */
            slug: string;
            /** Format: uuid */
            parentId?: string;
        };
        UpdateCategoryDto: {
            name?: string;
            /** @example home-garden */
            slug?: string;
            /**
             * Format: uuid
             * @description The new parent; `null` makes the category a root.
             */
            parentId?: string | null;
        };
        SellerProductResponseDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            sellerId: string;
            /** Format: uuid */
            categoryId: string;
            /** @enum {string} */
            type: "FIXED_PRICE" | "AUCTION";
            title: string;
            description: string;
            images: string[];
            priceCents: number | null;
            stock: number;
            version: number;
            /** @enum {string} */
            moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
            moderationReason: string | null;
            isPublished: boolean;
            /** Format: date-time */
            archivedAt: string | null;
            /** @description Average rating, two decimals. */
            ratingAvg: number;
            ratingCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /**
             * Format: uuid
             * @description The auction of an AUCTION product, set when the lot is created.
             */
            auctionId: string | null;
        };
        SellerProductPageDto: {
            items: components["schemas"]["SellerProductResponseDto"][];
            total: number;
            page: number;
            limit: number;
        };
        CreateProductDto: {
            /** @enum {string} */
            type: "FIXED_PRICE" | "AUCTION";
            /** Format: uuid */
            categoryId: string;
            title: string;
            description: string;
            /** @description Image URLs. */
            images?: string[];
            /** @description Price in cents; required for FIXED_PRICE. */
            priceCents?: number;
            /** @description Required for FIXED_PRICE. */
            stock?: number;
            /** @description Starting bid in cents; required for AUCTION. */
            startPriceCents?: number;
            /** @description Minimum raise per bid in cents; required for AUCTION. */
            bidStepCents?: number;
            /**
             * Format: date-time
             * @description When the first round ends, 1 minute to 30 days from now; required for AUCTION.
             */
            endsAt?: string;
        };
        UpdateProductDto: {
            /** Format: uuid */
            categoryId?: string;
            title?: string;
            description?: string;
            images?: string[];
            priceCents?: number;
        };
        UpdateStockDto: {
            /** @description The new absolute stock. */
            stock: number;
            /** @description The stock the new value was decided on. When given and the stock has changed since (a sale, a cancellation), nothing is written and the answer is 409 PRODUCT_STOCK_CONFLICT with the current stock. Other edits of the product (a review, a new title) do not count. */
            expectedStock?: number;
        };
        RatingDto: {
            /** @description Average rating, two decimals. */
            average: number;
            count: number;
        };
        ProductSellerDto: {
            /** Format: uuid */
            id: string;
            storeName: string;
        };
        ProductCategoryDto: {
            /** Format: uuid */
            id: string;
            name: string;
            slug: string;
        };
        ProductAuctionDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            status: "ACTIVE" | "SOLD_TO_WINNER" | "ORDERED" | "NOT_SOLD";
            /** @description The leading bid, or the start price while nobody has bid. */
            priceCents: number;
            /** Format: date-time */
            endsAt: string;
            /** @description True while the round still takes bids. */
            open: boolean;
        };
        ProductDetailsResponseDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            type: "FIXED_PRICE" | "AUCTION";
            title: string;
            description: string;
            images: string[];
            priceCents: number | null;
            stock: number;
            inStock: boolean;
            version: number;
            rating: components["schemas"]["RatingDto"];
            seller: components["schemas"]["ProductSellerDto"];
            category: components["schemas"]["ProductCategoryDto"];
            /** Format: date-time */
            createdAt: string;
            auction: components["schemas"]["ProductAuctionDto"] | null;
        };
        ProductStockResponseDto: {
            stock: number;
            inStock: boolean;
            version: number;
        };
        ProductSummaryResponseDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            type: "FIXED_PRICE" | "AUCTION";
            title: string;
            image: string | null;
            priceCents: number | null;
            inStock: boolean;
            rating: components["schemas"]["RatingDto"];
        };
        RejectProductDto: {
            reason: string;
        };
        AuctionDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            productId: string;
            /** Format: uuid */
            sellerId: string;
            /** @enum {string} */
            status: "ACTIVE" | "SOLD_TO_WINNER" | "ORDERED" | "NOT_SOLD";
            /** @description Starts at 1; a new round begins when the lot is offered again. */
            round: number;
            startPriceCents: number;
            bidStepCents: number;
            currentPriceCents: number | null;
            /** @description The lowest bid accepted now; null once the round is over. */
            minNextBidCents: number | null;
            bidCount: number;
            /** @description The leading bidder, masked. */
            leader: string | null;
            /** Format: date-time */
            endsAt: string;
            /**
             * Format: date-time
             * @description Until when the winner can check out.
             */
            winnerDeadlineAt: string | null;
            /** @description Grows with every change; clients drop updates that are older. */
            version: number;
            /**
             * Format: date-time
             * @description The server clock, to correct a client timer.
             */
            serverTime: string;
        };
        BidDto: {
            /** Format: uuid */
            id: string;
            round: number;
            amountCents: number;
            /** @description Masked for other people’s bids; the caller’s own say "You". */
            bidder: string;
            /** @description True for the caller’s own bids. */
            isOwn: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        BidPageDto: {
            items: components["schemas"]["BidDto"][];
            total: number;
            page: number;
            limit: number;
        };
        PlaceBidDto: {
            /** @description The bid in cents; at least `minNextBidCents`. */
            amountCents: number;
        };
        PlacedBidDto: {
            bid: components["schemas"]["BidDto"];
            /** @description The auction right after the bid. */
            auction: components["schemas"]["AuctionDto"];
        };
        AuctionPageDto: {
            items: components["schemas"]["AuctionDto"][];
            total: number;
            page: number;
            limit: number;
        };
        IdNameDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        CatalogItemDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            type: "FIXED_PRICE" | "AUCTION";
            title: string;
            imageUrl: string | null;
            priceCents: number | null;
            inStock: boolean;
            stock: number;
            rating: components["schemas"]["RatingDto"];
            seller: components["schemas"]["IdNameDto"];
            category: components["schemas"]["IdNameDto"];
            /**
             * Format: uuid
             * @description The lot to bid on; null for a fixed-price product.
             */
            auctionId: string | null;
            /**
             * @description Where the lot stands; null for a fixed-price product.
             * @enum {string|null}
             */
            auctionStatus: "ACTIVE" | "SOLD_TO_WINNER" | "ORDERED" | "NOT_SOLD" | null;
            /**
             * Format: date-time
             * @description When bidding closes; null for a fixed-price product or after the lot's round.
             */
            auctionEndsAt: string | null;
        };
        IdNameCountDto: {
            /** Format: uuid */
            id: string;
            name: string;
            count: number;
        };
        TypeFacetDto: {
            /** @enum {string} */
            value: "FIXED_PRICE" | "AUCTION";
            count: number;
        };
        InStockFacetDto: {
            value: boolean;
            count: number;
        };
        CatalogFacetsDto: {
            categories: components["schemas"]["IdNameCountDto"][];
            sellers: components["schemas"]["IdNameCountDto"][];
            types: components["schemas"]["TypeFacetDto"][];
            inStock: components["schemas"]["InStockFacetDto"][];
        };
        PriceRangeDto: {
            /** @description Lowest price among all matches, in cents. */
            min: number;
            /** @description Highest price among all matches, in cents. */
            max: number;
        };
        CatalogPageDto: {
            items: components["schemas"]["CatalogItemDto"][];
            total: number;
            page: number;
            limit: number;
            facets: components["schemas"]["CatalogFacetsDto"];
            priceRange: components["schemas"]["PriceRangeDto"] | null;
            /** @description True when the SQL fallback answered, with fewer facets. */
            degraded: boolean;
        };
        CartSellerDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        CartItemDto: {
            /** Format: uuid */
            productId: string;
            title: string;
            /** @description The current price, in kopecks. */
            unitPriceCents: number;
            quantity: number;
            /** @description The current stock. */
            stock: number;
            /** @enum {string} */
            availability: "AVAILABLE" | "INSUFFICIENT_STOCK" | "UNAVAILABLE";
            lineTotalCents: number;
        };
        CartGroupDto: {
            seller: components["schemas"]["CartSellerDto"];
            items: components["schemas"]["CartItemDto"][];
            subtotalCents: number;
        };
        CartResponseDto: {
            groups: components["schemas"]["CartGroupDto"][];
            totalCents: number;
            /** @description The sum of all quantities. */
            itemsCount: number;
            sellerCount: number;
        };
        AddCartItemDto: {
            quantity: number;
            /** Format: uuid */
            productId: string;
        };
        SetCartQuantityDto: {
            quantity: number;
        };
        FinanceSummaryDto: {
            /** @description Sales booked in the period, in kopecks. */
            grossCents: number;
            /** @description Given back to buyers in the period: refunds and cancelled sales. */
            refundsCents: number;
            /** @description Platform commission in the period, net of reversals. */
            commissionCents: number;
            /** @description gross − refunds − commission. */
            netCents: number;
            /** @description Paid out to the store in the period. */
            paidOutCents: number;
            /** @description Everything the platform owes the store now, over all time. */
            balanceCents: number;
        };
        LedgerEntryDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            sellerOrderId: string;
            /** Format: uuid */
            sellerId: string;
            /** @enum {string} */
            type: "SALE" | "COMMISSION" | "REFUND" | "COMMISSION_REVERSAL" | "CANCELLATION" | "PAYOUT";
            /** @description Signed from the store’s point of view; positive is owed to it. */
            amountCents: number;
            /** @description The refund or payout it stems from. */
            refId: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        LedgerPageDto: {
            items: components["schemas"]["LedgerEntryDto"][];
            total: number;
            page: number;
            limit: number;
        };
        SellerDto: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        OrderItemDto: {
            /**
             * Format: uuid
             * @description The id refunds refer to.
             */
            id: string;
            /** Format: uuid */
            productId: string;
            /** @description The title when the order was placed. */
            title: string;
            /** @description The price when the order was placed, in kopecks. */
            unitPriceCents: number;
            quantity: number;
            refundedQuantity: number;
            lineTotalCents: number;
        };
        StatusHistoryDto: {
            /** @enum {string|null} */
            from: "NEW" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED" | null;
            /** @enum {string} */
            to: "NEW" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
            /** @enum {string} */
            actor: "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM";
            reason: string | null;
            /** Format: date-time */
            at: string;
        };
        SellerOrderDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            orderId: string;
            /** Format: date-time */
            createdAt: string;
            seller: components["schemas"]["SellerDto"];
            /** @enum {string} */
            status: "NEW" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
            /** @enum {string} */
            paymentStatus: "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
            subtotalCents: number;
            refundedCents: number;
            /** @description The commission rate this order was priced with, in basis points. */
            commissionRateBps: number;
            /** @description The platform commission on this seller order. */
            commissionCents: number;
            /** @description What the seller receives. */
            payoutCents: number;
            items: components["schemas"]["OrderItemDto"][];
            statusHistory: components["schemas"]["StatusHistoryDto"][];
        };
        OrderResponseDto: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            status: "NEW" | "PROCESSING" | "PARTIALLY_SHIPPED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
            hasCancelledParts: boolean;
            subtotalCents: number;
            refundedCents: number;
            totalCents: number;
            /** @description The platform commission on the whole order. */
            commissionCents: number;
            /** Format: date-time */
            createdAt: string;
            sellerOrders: components["schemas"]["SellerOrderDto"][];
        };
        OrderPageDto: {
            items: components["schemas"]["OrderResponseDto"][];
            total: number;
            page: number;
            limit: number;
        };
        SellerOrderPageDto: {
            items: components["schemas"]["SellerOrderDto"][];
            total: number;
            page: number;
            limit: number;
        };
        SellerChangeStatusDto: {
            /** @enum {string} */
            status: "PROCESSING" | "SHIPPED";
        };
        CancelSellerOrderDto: {
            reason: string;
        };
        RefundItemDto: {
            /** Format: uuid */
            sellerOrderItemId: string;
            /** @description How many units to give back; at most what is left. */
            quantity: number;
        };
        CreateRefundDto: {
            items: components["schemas"]["RefundItemDto"][];
            reason: string;
        };
        RefundLineDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            sellerOrderItemId: string;
            quantity: number;
            /** @description Refunded amount in kopecks. */
            amountCents: number;
        };
        RefundResultDto: {
            /** @description Total refunded by this request, in kopecks. */
            amountCents: number;
            refunds: components["schemas"]["RefundLineDto"][];
            /** @description The seller order after the refund. */
            sellerOrder: components["schemas"]["SellerOrderDto"];
        };
        AdminChangeStatusDto: {
            /** @enum {string} */
            status: "COMPLETED";
        };
        NotificationResponseDto: {
            /** Format: uuid */
            id: string;
            /** @description The event this notification reports, e.g. seller_order.created. */
            type: string;
            /** @description Ids and new state from the event, plus the correlationId of the request behind it. */
            payload: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            readAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        NotificationPageDto: {
            items: components["schemas"]["NotificationResponseDto"][];
            total: number;
            page: number;
            limit: number;
        };
        UnreadCountDto: {
            count: number;
        };
        ReadAllResultDto: {
            /** @description How many notifications were marked read. */
            updated: number;
        };
        ReviewResponseDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            productId: string;
            authorName: string;
            rating: number;
            text: string;
            /** Format: date-time */
            createdAt: string;
        };
        ReviewPageDto: {
            items: components["schemas"]["ReviewResponseDto"][];
            total: number;
            page: number;
            limit: number;
        };
        ReviewEligibilityDto: {
            eligible: boolean;
            /** @enum {string|null} */
            reason: "NOT_PURCHASED" | "ALREADY_REVIEWED" | null;
        };
        CreateReviewDto: {
            rating: number;
            text: string;
        };
        CreateDisputeDto: {
            /** Format: uuid */
            sellerOrderId: string;
            reason: string;
        };
        DisputeDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            orderId: string;
            /** Format: uuid */
            sellerOrderId: string;
            /** Format: uuid */
            customerId: string;
            /** Format: uuid */
            sellerId: string;
            reason: string;
            /** @enum {string} */
            status: "OPEN" | "UNDER_REVIEW" | "RESOLVED_BUYER_FAVOR" | "RESOLVED_SELLER_FAVOR";
            resolutionNote: string | null;
            /** Format: date-time */
            resolvedAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        DisputePageDto: {
            items: components["schemas"]["DisputeDto"][];
            total: number;
            page: number;
            limit: number;
        };
        DisputeMessageDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            authorId: string;
            /** @enum {string} */
            authorRole: "CUSTOMER" | "SELLER" | "ADMIN";
            text: string;
            /** Format: date-time */
            createdAt: string;
        };
        DisputeDetailsDto: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            orderId: string;
            /** Format: uuid */
            sellerOrderId: string;
            /** Format: uuid */
            customerId: string;
            /** Format: uuid */
            sellerId: string;
            reason: string;
            /** @enum {string} */
            status: "OPEN" | "UNDER_REVIEW" | "RESOLVED_BUYER_FAVOR" | "RESOLVED_SELLER_FAVOR";
            resolutionNote: string | null;
            /** Format: date-time */
            resolvedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            messages: components["schemas"]["DisputeMessageDto"][];
        };
        CreateDisputeMessageDto: {
            text: string;
        };
        ResolveDisputeDto: {
            /** @enum {string} */
            outcome: "RESOLVED_BUYER_FAVOR" | "RESOLVED_SELLER_FAVOR";
            /** @description Items to refund; only with RESOLVED_BUYER_FAVOR. */
            refundItems?: components["schemas"]["RefundItemDto"][];
            /**
             * @description The status the seller order ends in; only with RESOLVED_BUYER_FAVOR.
             * @enum {string}
             */
            sellerOrderFinalStatus?: "CANCELLED" | "COMPLETED";
            note: string;
        };
        ResolveDisputeResultDto: {
            dispute: components["schemas"]["DisputeDto"];
            refund: components["schemas"]["RefundResultDto"] | null;
            sellerOrder: components["schemas"]["SellerOrderDto"];
        };
        StoreSalesDto: {
            /** Format: uuid */
            sellerId: string;
            storeName: string;
            /** @description Orders not cancelled. */
            ordersCount: number;
            /** @description Items sold, in units. */
            itemsCount: number;
            /** @description Sales before refunds, in kopecks. */
            grossCents: number;
            refundedCents: number;
            /** @description gross − refunds: what the ranking is by. */
            revenueCents: number;
            /** @description Platform commission after refunds. */
            commissionCents: number;
            /** @description revenue − commission. */
            netCents: number;
        };
        ProductSalesDto: {
            /** Format: uuid */
            productId: string;
            title: string;
            /** Format: uuid */
            sellerId: string;
            /** @description Units sold. */
            quantity: number;
            grossCents: number;
            refundedCents: number;
            /** @description gross − refunds: what the ranking is by. */
            revenueCents: number;
        };
        ConversionDto: {
            /** @description Carts that got their first item in the period. */
            cartsWithItems: number;
            /** @description Of those, carts that became an order. */
            convertedCarts: number;
            /** @description convertedCarts / cartsWithItems, 0 to 1. */
            rate: number;
        };
        AnalyticsSummaryDto: {
            /** @example 2026-03-01 */
            from: string;
            /** @example 2026-03-30 */
            to: string;
            /** @description Sum of commissions after refunds and cancellations. */
            platformRevenueCents: number;
            grossSalesCents: number;
            refundsCents: number;
            /** @description Orders not cancelled. */
            ordersCount: number;
            revenueBySeller: components["schemas"]["StoreSalesDto"][];
            /** @description Up to 5, by revenue. */
            topProducts: components["schemas"]["ProductSalesDto"][];
            /** @description Up to 5, by revenue. */
            topSellers: components["schemas"]["StoreSalesDto"][];
            conversion: components["schemas"]["ConversionDto"];
        };
        ChartDayDto: {
            /** @example 2026-03-01 */
            date: string;
            grossCents: number;
            commissionCents: number;
            ordersCount: number;
        };
        ChartTotalsDto: {
            grossCents: number;
            commissionCents: number;
            ordersCount: number;
        };
        ChartDeltaDto: {
            grossCents: number | null;
            commissionCents: number | null;
            ordersCount: number | null;
        };
        ChartTotalsPairDto: {
            current: components["schemas"]["ChartTotalsDto"];
            previous: components["schemas"]["ChartTotalsDto"];
            /** @description Change from previous to current in percent; null when previous is zero. */
            deltaPct: components["schemas"]["ChartDeltaDto"];
        };
        SalesChartDto: {
            /** @description One entry per day, oldest first. */
            current: components["schemas"]["ChartDayDto"][];
            /** @description The same number of days right before. */
            previous: components["schemas"]["ChartDayDto"][];
            totals: components["schemas"]["ChartTotalsPairDto"];
        };
        AnalyticsReportDto: {
            /**
             * @description Changes when the shape of the report does.
             * @example 1
             */
            schemaVersion: number;
            /**
             * @description The zone that decides which day a sale is on.
             * @example Europe/Kyiv
             */
            timeZone: string;
            summary: components["schemas"]["AnalyticsSummaryDto"];
            /** @description Every day of the period, oldest first. */
            daily: components["schemas"]["ChartDayDto"][];
            /** @description Every product sold in the period, by revenue. */
            products: components["schemas"]["ProductSalesDto"][];
        };
        SellerRevenueDto: {
            /** @description Orders not cancelled, placed in the period. */
            ordersCount: number;
            /** @description Items sold, in units. */
            itemsCount: number;
            /** @description Sales before refunds, in kopecks. */
            grossCents: number;
            refundsCents: number;
            /** @description The platform’s commission after refunds. */
            commissionCents: number;
            /** @description gross − refunds − commission. */
            netCents: number;
        };
        SellerOrderStatusCountsDto: {
            NEW: number;
            PROCESSING: number;
            SHIPPED: number;
            COMPLETED: number;
            CANCELLED: number;
        };
        ActiveLotDto: {
            /** Format: uuid */
            auctionId: string;
            /** Format: uuid */
            productId: string;
            title: string;
            /** @description The leading bid, or the starting price while there are no bids. */
            currentPriceCents: number;
            bidCount: number;
            /** Format: date-time */
            endsAt: string;
        };
        SellerDashboardDto: {
            /** @example 2026-03-01 */
            from: string;
            /** @example 2026-03-30 */
            to: string;
            revenue: components["schemas"]["SellerRevenueDto"];
            /** @description Seller orders placed in the period, by their status now. */
            ordersByStatus: components["schemas"]["SellerOrderStatusCountsDto"];
            /** @description The five newest, whatever the period. */
            recentOrders: components["schemas"]["SellerOrderDto"][];
            /** @description Auctions taking bids now, ending first up front. */
            activeLots: components["schemas"]["ActiveLotDto"][];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    AuthController_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "email": "alice@example.com",
                 *       "password": "S3cure-pass",
                 *       "name": "Alice"
                 *     }
                 */
                "application/json": components["schemas"]["RegisterDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "email": "alice@example.com",
                 *       "password": "S3cure-pass"
                 *     }
                 */
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_refresh: {
        parameters: {
            query?: never;
            header: {
                /** @description Any value, for example `XMLHttpRequest`; a CSRF guard for cookie-based calls. */
                "X-Requested-With": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Unexpected failure (INTERNAL_ERROR). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_providers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProvidersResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Unexpected failure (INTERNAL_ERROR). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_googleLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to Google. */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A required dependency is unavailable (DEPENDENCY_UNAVAILABLE). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuthController_googleCallback: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirect to the SPA. */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A required dependency is unavailable (DEPENDENCY_UNAVAILABLE). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    PasswordController_setPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "currentPassword": "S3cure-pass",
                 *       "newPassword": "N3w-secure-pass"
                 *     }
                 */
                "application/json": components["schemas"]["SetPasswordDto"];
            };
        };
        responses: {
            /** @description The password was set. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    UsersController_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    UsersController_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "name": "Alice Johnson"
                 *     }
                 */
                "application/json": components["schemas"]["UpdateProfileDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellersController_apply: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "storeName": "Alice’s Gadgets",
                 *       "description": "Refurbished phones and tablets."
                 *     }
                 */
                "application/json": components["schemas"]["ApplyForSellerDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerApplicationResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellersController_myApplication: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerApplicationResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellersController_profile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProfileResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminSellerApplicationsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only entries in this status. */
                status?: "PENDING" | "APPROVED" | "REJECTED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerApplicationPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminSellerApplicationsController_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminSellerApplicationResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminSellerApplicationsController_reject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "reason": "The store description is missing."
                 *     }
                 */
                "application/json": components["schemas"]["RejectApplicationDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminSellerApplicationResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    HealthController_check: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Unexpected failure (INTERNAL_ERROR). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    HealthController_ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Every gating dependency is up. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A required dependency is unavailable (DEPENDENCY_UNAVAILABLE). */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CategoriesController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryResponseDto"][];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Unexpected failure (INTERNAL_ERROR). */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminCategoriesController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "name": "Home & Garden",
                 *       "slug": "home-garden",
                 *       "parentId": "3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b"
                 *     }
                 */
                "application/json": components["schemas"]["CreateCategoryDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminCategoriesController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminCategoriesController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "name": "Garden & Outdoor"
                 *     }
                 */
                "application/json": components["schemas"]["UpdateCategoryDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only products of this category (UUID). */
                categoryId?: string;
                /** @description Moderation status of the product. */
                moderationStatus?: "PENDING" | "APPROVED" | "REJECTED";
                /** @description Product type: `FIXED_PRICE` or `AUCTION`. */
                type?: "FIXED_PRICE" | "AUCTION";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "type": "FIXED_PRICE",
                 *       "categoryId": "3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b",
                 *       "title": "Refurbished phone",
                 *       "description": "Tested, 12 months warranty.",
                 *       "images": [
                 *         "https://cdn.example.com/phone.jpg"
                 *       ],
                 *       "priceCents": 1299900,
                 *       "stock": 5
                 *     }
                 */
                "application/json": components["schemas"]["CreateProductDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_archive: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "title": "Refurbished phone, 128 GB",
                 *       "priceCents": 1249900
                 *     }
                 */
                "application/json": components["schemas"]["UpdateProductDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerProductsController_setStock: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "stock": 12,
                 *       "expectedStock": 10
                 *     }
                 */
                "application/json": components["schemas"]["UpdateStockDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ProductsController_getDetails: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductDetailsResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ProductsController_getStock: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductStockResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ProductsController_getSimilar: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProductSummaryResponseDto"][];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminProductsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only entries in this status. */
                status?: "PENDING" | "APPROVED" | "REJECTED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminProductsController_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminProductsController_reject: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "reason": "The photos do not show the item."
                 *     }
                 */
                "application/json": components["schemas"]["RejectProductDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerProductResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuctionsController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AuctionsController_listBids: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Defaults to the current round. */
                round?: number;
            };
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BidPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    BidsController_place: {
        parameters: {
            query?: never;
            header: {
                /** @description UUID chosen by the client; repeat it to retry the same request safely. */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "amountCents": 1350000
                 *     }
                 */
                "application/json": components["schemas"]["PlaceBidDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlacedBidDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerAuctionsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuctionPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CatalogController_find: {
        parameters: {
            query?: {
                /** @description Search text. */
                q?: string;
                /** @description Only products of this category (UUID). */
                categoryId?: string;
                /** @description Only this store (UUID). */
                sellerId?: string;
                /** @description In cents. */
                priceMin?: number;
                /** @description In cents. */
                priceMax?: number;
                /** @description Lowest average rating. */
                ratingMin?: number;
                /** @description Only products that are (`true`) or are not (`false`) in stock. */
                inStock?: boolean;
                /** @description Product type: `FIXED_PRICE` or `AUCTION`. */
                type?: "FIXED_PRICE" | "AUCTION";
                /** @description Sort order. */
                sort?: "relevance" | "price_asc" | "price_desc" | "rating_desc" | "newest";
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Page size. */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    /** @description Set to 1 when the SQL fallback answered instead of the search index. */
                    "X-Search-Degraded"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Rate limit exceeded (RATE_LIMITED). */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CartController_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CartController_clear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CartController_addItem: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "productId": "3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b",
                 *       "quantity": 2
                 *     }
                 */
                "application/json": components["schemas"]["AddCartItemDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CartController_removeItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the product. */
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    CartController_setQuantity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the product. */
                productId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "quantity": 3
                 *     }
                 */
                "application/json": components["schemas"]["SetCartQuantityDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CartResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerFinanceController_summary: {
        parameters: {
            query?: {
                /** @description ISO 8601, inclusive. */
                from?: string;
                /** @description ISO 8601, inclusive. */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FinanceSummaryDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminLedgerController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only this store’s entries. */
                sellerId?: string;
                /** @description ISO 8601, inclusive. */
                from?: string;
                /** @description ISO 8601, inclusive. */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LedgerPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    OrdersController_create: {
        parameters: {
            query?: never;
            header: {
                /** @description UUID chosen by the client; repeat it to retry the same request safely. */
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    OrdersController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    OrdersController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    OrdersController_confirmReceipt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the order. */
                orderId: string;
                /** @description Identifier (UUID) of the seller order inside that order. */
                soId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    OrdersController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the order. */
                orderId: string;
                /** @description Identifier (UUID) of the seller order inside that order. */
                soId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerOrdersController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only entries in this status. */
                status?: "NEW" | "PROCESSING" | "SHIPPED" | "COMPLETED" | "CANCELLED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerOrdersController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerOrdersController_changeStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "status": "PROCESSING"
                 *     }
                 */
                "application/json": components["schemas"]["SellerChangeStatusDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerOrdersController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "reason": "The item turned out to be out of stock."
                 *     }
                 */
                "application/json": components["schemas"]["CancelSellerOrderDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerOrdersController_refund: {
        parameters: {
            query?: never;
            header: {
                /** @description UUID chosen by the client; repeat it to retry the same request safely. */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "items": [
                 *         {
                 *           "sellerOrderItemId": "3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b",
                 *           "quantity": 1
                 *         }
                 *       ],
                 *       "reason": "The screen is scratched."
                 *     }
                 */
                "application/json": components["schemas"]["CreateRefundDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundResultDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminOrdersController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only entries in this status. */
                status?: "NEW" | "PROCESSING" | "PARTIALLY_SHIPPED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminOrdersController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminSellerOrdersController_changeStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "status": "COMPLETED"
                 *     }
                 */
                "application/json": components["schemas"]["AdminChangeStatusDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminSellerOrdersController_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "reason": "Fraud suspected."
                 *     }
                 */
                "application/json": components["schemas"]["CancelSellerOrderDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerOrderDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    NotificationsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only notifications created after this moment: what a client missed while it was offline. */
                after?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    NotificationsController_unreadCount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnreadCountDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    NotificationsController_readAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadAllResultDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    NotificationsController_read: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ReviewsController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
            };
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewPageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ReviewsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "rating": 5,
                 *       "text": "Works as described, fast delivery."
                 *     }
                 */
                "application/json": components["schemas"]["CreateReviewDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewResponseDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    ReviewsController_eligibility: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReviewEligibilityDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    DisputesController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputePageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    DisputesController_open: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "sellerOrderId": "3f2b8c1e-5d4a-4e9b-9a7c-1b2d3e4f5a6b",
                 *       "reason": "The parcel never arrived."
                 *     }
                 */
                "application/json": components["schemas"]["CreateDisputeDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputeDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    DisputesController_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputeDetailsDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    DisputesController_addMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "text": "I have sent the tracking number by message."
                 *     }
                 */
                "application/json": components["schemas"]["CreateDisputeMessageDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputeMessageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminDisputesController_list: {
        parameters: {
            query?: {
                /** @description Page number, starting at 1. */
                page?: number;
                /** @description Only entries in this status. */
                status?: "OPEN" | "UNDER_REVIEW" | "RESOLVED_BUYER_FAVOR" | "RESOLVED_SELLER_FAVOR";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputePageDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminDisputesController_review: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisputeDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminDisputesController_resolve: {
        parameters: {
            query?: never;
            header: {
                /** @description UUID chosen by the client; repeat it to retry the same request safely. */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Identifier (UUID) of the resource. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "outcome": "RESOLVED_BUYER_FAVOR",
                 *       "refundItems": [
                 *         {
                 *           "sellerOrderItemId": "8a1c6e2f-7b3d-4c5e-8f90-a1b2c3d4e5f6",
                 *           "quantity": 1
                 *         }
                 *       ],
                 *       "sellerOrderFinalStatus": "COMPLETED",
                 *       "note": "The carrier confirmed the loss."
                 *     }
                 */
                "application/json": components["schemas"]["ResolveDisputeDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResolveDisputeResultDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Resource not found, or not visible to the caller (NOT_FOUND). */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Conflicts with the current state (CONFLICT). */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED). */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminAnalyticsController_summary: {
        parameters: {
            query?: {
                /** @description First day. Defaults to 29 days before `to`, so the period is 30 days. */
                from?: string;
                /** @description Last day. Defaults to today. */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsSummaryDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminAnalyticsController_salesChart: {
        parameters: {
            query?: {
                /** @description Days in the chart, ending today; the previous period has as many days. */
                days?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SalesChartDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    AdminAnalyticsController_report: {
        parameters: {
            query?: {
                /** @description First day. Defaults to 29 days before `to`, so the period is 30 days. */
                from?: string;
                /** @description Last day. Defaults to today. */
                to?: string;
                /** @description Download format: `csv` or `json`. */
                format?: "csv" | "json";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description JSON; with `format=csv` a text/csv file. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsReportDto"];
                    "text/csv": components["schemas"]["AnalyticsReportDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                    "text/csv": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                    "text/csv": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                    "text/csv": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
    SellerDashboardController_get: {
        parameters: {
            query?: {
                /** @description First day. Defaults to 29 days before `to`, so the period is 30 days. */
                from?: string;
                /** @description Last day. Defaults to today. */
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SellerDashboardDto"];
                };
            };
            /** @description Malformed or invalid request (VALIDATION_FAILED, BAD_REQUEST). */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Missing or invalid credentials (UNAUTHORIZED). */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
            /** @description Authenticated but not allowed (FORBIDDEN). */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponseDto"];
                };
            };
        };
    };
}

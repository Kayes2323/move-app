# MOVE Shop

* Pages: `/shop` (catalogue), `/shop/item?id=...`, `/shop/cart` (cart + order request), `/shop/orders` (my orders). Linked from Profile.
* Payment: **cash on delivery only**. No online payment is taken. An order is a *request*: the MOVE team calls the customer to confirm.
* Catalogue and prices: `app/data/shop.ts` (one place). After changing a price run `npm run shop:rules` (updates the price list in
  `firestore.rules`), `npm test`, then publish the rules.
* Suggested launch prices (BDT, confirm before launch): Electrolyte Lemon 500 ml ৳90, Rehydrate Lemon ৳100, Performance Tee ৳990,
  Training Pants ৳1,490, Track Pants ৳1,690, Running Shoes ৳4,490, Activewear Set ৳2,290. Delivery: inside Dhaka ৳70, outside ৳130.
* Product photos: put the poster for each product at `public/images/shop/<id>.webp` (ids in `app/data/shop.ts`). Until a file
  exists, the shop shows a plain "MOVE · Photo coming soon" tile, never an invented picture.

## Orders in Firestore (`orders/{id}`)
`{ uid, items[{id, name, size, qty, unitPrice}], subtotal, delivery, total, payment: "cod", status: "requested", contact{name, phone,
address, area, note}, createdAt }`. The rules accept an order only if every line uses the catalogue price, the totals add up, the
delivery charge matches the area, and it is the customer's own. Customers read only their own orders and can never edit or delete one.

**Handling orders today:** Firebase console → Firestore → `orders`. Change `status` to `confirmed`, `shipped`, `delivered` or
`cancelled` there; the customer's "My orders" shows it. An admin screen and order notifications are not built yet.

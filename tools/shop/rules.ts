// Writes the shop's prices and delivery charges into firestore.rules (the generated:begin shopPrices block), from app/data/shop.ts.
// Run after changing a price: npm run shop:rules
import { readFileSync, writeFileSync } from "node:fs";
import { DELIVERY, PRODUCTS } from "../../app/data/shop";

const file = new URL("../../firestore.rules", import.meta.url);
const rules = readFileSync(file, "utf8");
const block = `      // generated:begin shopPrices (tools/shop/rules.ts)
      function shopPrice(id) {
        return ({ ${PRODUCTS.map((p) => `'${p.id}': ${p.price}`).join(", ")} }).get(id, -1);
      }
      function deliveryFee(area) {
        return ({ 'inside': ${DELIVERY.insideDhaka}, 'outside': ${DELIVERY.outsideDhaka} }).get(area, -1);
      }
      // generated:end shopPrices`;
const re = /      \/\/ generated:begin shopPrices[\s\S]*?\/\/ generated:end shopPrices/;
if (!re.test(rules)) throw new Error("no shopPrices block in firestore.rules");
writeFileSync(file, rules.replace(re, block));
console.log("firestore.rules: shop prices updated");

import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET);

// ===========================================================
// SHOPIFY WEBHOOK — orders/create
// ===========================================================
app.post("/shopify/orders/create", async (req, res) => {
  const order = req.body;

  console.log("📦 Ordem recebida:", order.id);

  // 1. Verificar método MB WAY manual
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb way") ||
    g.toLowerCase().includes("mbway")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → ignorado");
    return res.send("ignored");
  }

  console.log("✔ Método MB WAY detectado");

  // 2. Telefone
  let phone =
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone;

  if (!phone) {
    console.log("❌ Sem telefone");
    return res.send("missing_phone");
  }

  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");

  // 3. Valor em cêntimos
  const amount = Math.round(parseFloat(order.total_price) * 100);

  let paymentIntent;

  // 4. Criar PaymentIntent Stripe
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mb_way"],
      payment_method_options: {
        mb_way: {
          phone_number: phone
        }
      },
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name
      }
    });
  } catch (err) {
    console.error("❌ Erro Stripe PI:", err);
    return res.status(500).send("stripe_error");
  }

  const paymentUrl = `https://pay.stripe.com/pay/${paymentIntent.client_secret}`;
  console.log("🔗 Payment URL:", paymentUrl);

  // 5. Guardar redirect_url na ordem da Shopify
  try {
    const shopResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/orders/${order.id}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN
        },
        body: JSON.stringify({
          order: {
            id: order.id,
            note_attributes: [
              {
                name: "redirect_url",
                value: paymentUrl
              }
            ]
          }
        })
      }
    );

    const resultText = await shopResponse.text();
    console.log("📨 Shopify PATCH Response:", resultText);

  } catch (err) {
    console.error("❌ Erro ao atualizar Shopify:", err);
  }

  return res.send("ok");
});

// ===========================================================
// STRIPE WEBHOOK
// ===========================================================
app.post("/stripe/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  console.log("💳 Stripe webhook recebido");
  res.send("ok");
});

// ===========================================================
// SERVER
// ===========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Server a correr na porta ${PORT}`));

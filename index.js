import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

// =====================================================
// INIT
// =====================================================
const app = express();

// Stripe exige RAW body para webhooks → aplicamos APENAS no /stripe/webhook
app.use("/stripe/webhook", bodyParser.raw({ type: "application/json" }));

// Para todos os restantes endpoints → JSON normal
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

// =====================================================
// HELPER – Marcar order como paga na Shopify
// =====================================================
async function markShopifyOrderPaid(orderId, paymentIntentId) {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/orders/${orderId}/transactions.json`;

    const body = {
      transaction: {
        kind: "capture",
        status: "success",
        gateway: "Stripe MB WAY",
        authorization: paymentIntentId,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Erro a marcar order paga:", response.status, errorText);
    } else {
      console.log("✅ Order marcada como paga na Shopify:", orderId);
    }
  } catch (err) {
    console.error("❌ Erro markShopifyOrderPaid:", err);
  }
}

// =====================================================
// SHOPIFY WEBHOOK – orders/create
// =====================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida");

  const order = req.body;
  const gateways = order.payment_gateway_names || [];

  console.log("🔍 Gateways:", gateways);

  // detetar MB WAY no método manual criado na Shopify
  const isMBWAY = gateways.some((g) =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → Ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado → a criar PaymentIntent");

  const amountCents = Math.round(parseFloat(order.total_price) * 100);

  const phone =
    order.phone ||
    order.billing_address?.phone ||
    order.shipping_address?.phone;

  if (!phone) {
    console.log("⚠️ Encomenda MB WAY sem telefone, impossível processar.");
    return res.status(200).send("missing phone");
  }

  try {
    // Criar PaymentIntent MB WAY
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      payment_method_types: ["mb_way"],
      payment_method_data: {
        type: "mb_way",
        mb_way: { phone },
        billing_details: {
          email: order.email,
          name:
            (order.shipping_address?.first_name || "") +
            " " +
            (order.shipping_address?.last_name || ""),
        },
      },
      confirm: true,
      metadata: {
        shopify_order_id: order.id,
        shopify_order_name: order.name,
      },
    });

    console.log("💳 PaymentIntent criado:", pi.id);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Erro a criar PaymentIntent MB WAY:", err);
    return res.status(200).send("stripe-error");
  }
});

// =====================================================
// STRIPE WEBHOOK – payment_intent.succeeded
// =====================================================
app.post("/stripe/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook Stripe inválido:", err.message);
    return res.status(400).send("Webhook error");
  }

  console.log("📩 Evento Stripe:", event.type);

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi.metadata?.shopify_order_id;

    if (orderId) {
      console.log("💸 MB WAY pago → A marcar order paga na Shopify:", orderId);
      markShopifyOrderPaid(orderId, pi.id);
    }
  }

  res.sendStatus(200);
});

// =====================================================
// ROOT
// =====================================================
app.get("/", (req, res) => {
  res.send("MB WAY app está a correr 🚀");
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo na porta ${PORT}`);
});

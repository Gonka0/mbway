import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

// Iniciar app Express
const app = express();

// Stripe precisa de raw body apenas no webhook
app.use("/stripe/webhook", bodyParser.raw({ type: "application/json" }));

// Restante API usa JSON normal
app.use(bodyParser.json());

// Stripe init
const stripe = new Stripe(process.env.STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

// =====================================================
// FUNÇÃO → marcar order como paga na Shopify
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
      console.error("❌ Erro Shopify:", await response.text());
    } else {
      console.log("✅ Order marcada como paga na Shopify:", orderId);
    }
  } catch (err) {
    console.error("❌ Erro markShopifyOrderPaid:", err);
  }
}

// =====================================================
// SHOPIFY WEBHOOK — orders/create
// =====================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Webhook Shopify recebido");

  const order = req.body;
  const gateways = order.payment_gateway_names || [];

  console.log("🔍 Gateways:", gateways);

  const isMBWAY = gateways.some((g) =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → Ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado → Criar Checkout Session");

  const amountCents = Math.round(parseFloat(order.total_price) * 100);

  try {
    // Criar a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["mb_way"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Pedido ${order.name}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.SUCCESS_URL}?order=${order.id}`,
      cancel_url: `${process.env.CANCEL_URL}?order=${order.id}`,
      metadata: {
        shopify_order_id: order.id,
      },
    });

    console.log("🔗 Checkout Session criada:", session.url);

    // (Opcional) Podes enviar este link por email ao cliente
    // Ou guardar via Firestore ou BD

    return res.status(200).send({
      checkout_url: session.url,
    });

  } catch (err) {
    console.error("❌ Erro Stripe:", err);
    return res.status(200).send("stripe-error");
  }
});

// =====================================================
// STRIPE WEBHOOK — payment_intent.succeeded
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const orderId = session.metadata?.shopify_order_id;
    const pi = session.payment_intent;

    if (orderId && pi) {
      console.log("💸 MB WAY pago → Atualizar Shopify:", orderId);
      markShopifyOrderPaid(orderId, pi);
    }
  }

  res.sendStatus(200);
});

// =====================================================
// TESTE
// =====================================================
app.get("/", (req, res) => {
  res.send("🚀 MB WAY App com Checkout Session está ativa");
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});

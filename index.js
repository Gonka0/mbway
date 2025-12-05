import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const app = express();

// Stripe exige raw body PARA O WEBHOOK
app.use("/stripe/webhook", bodyParser.raw({ type: "application/json" }));

// Todos os outros endpoints usam JSON normal
app.use(bodyParser.json());

// Stripe init
const stripe = new Stripe(process.env.STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

// =====================================================
// FUNÇÃO → MARCAR ORDER COMO PAGA NA SHOPIFY
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
      console.log("✅ Order marcada como paga:", orderId);
    }
  } catch (error) {
    console.error("❌ Erro markShopifyOrderPaid:", error);
  }
}

// =====================================================
// SHOPIFY → WEBHOOK orders/create
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
    console.log("⛔ Não é MB WAY → ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado → criar Checkout Session");

  const amountCents = Math.round(parseFloat(order.total_price) * 100);

  // Criar Checkout Session com MB WAY
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["mb_way"],

      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Pedido ${order.name}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],

      // URLs temporárias até quereres personalizar
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",

      // AQUI ESTÁ A CORREÇÃO IMPORTANTE → metadata no PaymentIntent
      payment_intent_data: {
        metadata: {
          shopify_order_id: order.id,
        },
      },
    });

    console.log("🔗 Checkout Session criada:", session.url);

    return res.status(200).send({
      checkout_url: session.url,
    });
  } catch (error) {
    console.error("❌ Erro Stripe:", error);
    return res.status(200).send("stripe-error");
  }
});

// =====================================================
// STRIPE → WEBHOOK (EVENTO REAL DE PAGAMENTO MB WAY)
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
  } catch (error) {
    console.error("❌ Webhook Stripe inválido:", error.message);
    return res.status(400).send("Webhook error");
  }

  console.log("📩 Stripe event recebido:", event.type);

  // O EVENTO QUE CONFIRMA MB WAY É ESTE:
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;

    console.log("💸 PaymentIntent (MB WAY) SUCCEEDED:", pi.id);

    const orderId = pi.metadata?.shopify_order_id;

    if (!orderId) {
      console.log("⚠️ PaymentIntent sem order ID → ignorado");
      return res.sendStatus(200);
    }

    console.log("✔ A marcar encomenda paga na Shopify:", orderId);
    markShopifyOrderPaid(orderId, pi.id);
  }

  return res.sendStatus(200);
});

// =====================================================
// ROOT
// =====================================================
app.get("/", (req, res) => {
  res.send("🚀 MB WAY App operacional");
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});

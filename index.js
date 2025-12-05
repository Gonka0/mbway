import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const app = express();

// Stripe raw body ONLY for webhook
app.use("/stripe/webhook", bodyParser.raw({ type: "application/json" }));
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET, {
  apiVersion: "2024-06-20",
});

// =====================================================
// MARK ORDER AS PAID (Shopify)
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
      console.error("❌ Shopify error:", await response.text());
    } else {
      console.log("✅ Order marked as paid:", orderId);
    }
  } catch (err) {
    console.error("❌ markShopifyOrderPaid error:", err);
  }
}

// =====================================================
// SHOPIFY → webhook orders/create
// =====================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Shopify webhook received");

  const order = req.body;
  const gateways = order.payment_gateway_names || [];

  console.log("🔍 Gateways:", gateways);

  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Not MB WAY → ignored");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detected → creating Checkout Session");

  const amountCents = Math.round(parseFloat(order.total_price) * 100);

  try {
    // Create Stripe Checkout Session WITHOUT env URLs
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
      // temporary URLs
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",

      metadata: {
        shopify_order_id: order.id,
      },
    });

    console.log("🔗 Checkout Session:", session.url);

    return res.status(200).send({
      checkout_url: session.url,
    });

  } catch (err) {
    console.error("❌ Stripe error:", err);
    return res.status(200).send("stripe-error");
  }
});

// =====================================================
// STRIPE → webhook
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
    console.error("❌ Stripe webhook invalid:", err.message);
    return res.status(400).send("Webhook error");
  }

  console.log("📩 Stripe event:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const orderId = session.metadata?.shopify_order_id;
    const paymentIntent = session.payment_intent;

    if (orderId && paymentIntent) {
      console.log("💸 MB WAY paid → marking Shopify order:", orderId);
      markShopifyOrderPaid(orderId, paymentIntent);
    }
  }

  res.sendStatus(200);
});

// =====================================================
// ROOT
// =====================================================
app.get("/", (req, res) => {
  res.send("🚀 MB WAY app with Checkout Session is running");
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});

import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const app = express();

// JSON normal
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET);

// ===========================================================
//  WEBHOOK — SHOPIFY: orders/create
// ===========================================================
app.post("/shopify/orders/create", async (req, res) => {
  const order = req.body;

  console.log("📦 Shopify order recebida:", order.id);

  // 1️⃣ Verificar MB WAY manual
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb way") || g.toLowerCase().includes("mbway")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → ignorado");
    return res.send("ignored");
  }

  console.log("✔ Método MB WAY identificado");

  // 2️⃣ Buscar telefone
  let phone =
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone;

  if (!phone) {
    console.log("❌ Sem telefone");
    return res.send("missing_phone");
  }

  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");

  // 3️⃣ Valor total
  const amount = Math.round(parseFloat(order.total_price) * 100);

  // 4️⃣ Criar Payment Intent
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mb_way"],
      payment_method_options: {
        mb_way: { phone_number: phone }
      },
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name
      }
    });
  } catch (err) {
    console.error("❌ Erro Stripe:", err);
    return res.status(500).send("stripe_error");
  }

  const paymentUrl = `https://pay.stripe.com/pay/${paymentIntent.client_secret}`;
  console.log("🔗 URL MB WAY:", paymentUrl);

  // 5️⃣ Guardar redirect_url na order da Shopify
  try {
    const response = await fetch(
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

    const text = await response.text();
    console.log("📨 Shopify Response:", text);
  } catch (err) {
    console.error("❌ Erro Shopify PATCH:", err);
  }

  return res.send("ok");
});

// ===========================================================
//  WEBHOOK STRIPE (opcional por agora, só logs)
// ===========================================================
app.post("/stripe/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  console.log("💳 Stripe webhook recebido");
  res.send("ok");
});

// ===========================================================
//  ROOT
// ===========================================================
app.get("/", (req, res) => {
  res.send("MB WAY bridge online 🚀");
});

// ===========================================================
//  START SERVER
// ===========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Servidor ativo na porta ${PORT}`));

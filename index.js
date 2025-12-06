import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const app = express();

// Para quase todos os endpoints usamos JSON normal
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET);

// ===========================================================
//  SHOPIFY WEBHOOK — orders/create
// ===========================================================
app.post("/shopify/orders/create", async (req, res) => {
  const order = req.body;

  console.log("📦 Shopify order recebida:", order.id);

  // 1. Verificar se o método é MB WAY (manual)
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some((g) =>
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
    (order.billing_address && order.billing_address.phone) ||
    (order.shipping_address && order.shipping_address.phone) ||
    order.phone;

  if (!phone) {
    console.log("❌ Sem telefone na encomenda");
    return res.send("missing_phone");
  }

  phone = String(phone).replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Telefone limpo:", phone);

  // 3. Valor em cêntimos
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor em cêntimos:", amount);

  let paymentIntent;

  // 4. Criar PaymentIntent MB WAY na Stripe
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mb_way"],
      payment_method_options: {
        mb_way: {
          phone_number: phone,
        },
      },
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name,
      },
    });
  } catch (err) {
    console.error("❌ Erro ao criar PaymentIntent Stripe:", err);
    return res.status(500).send("stripe_error");
  }

  const paymentUrl = `https://pay.stripe.com/pay/${paymentIntent.client_secret}`;
  console.log("🔗 Payment URL:", paymentUrl);

  // 5. Guardar redirect_url na encomenda da Shopify (note_attributes)
  try {
    const shopResponse = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2023-10/orders/${order.id}.json`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({
          order: {
            id: order.id,
            note_attributes: [
              {
                name: "redirect_url",
                value: paymentUrl,
              },
            ],
          },
        }),
      }
    );

    const resultText = await shopResponse.text();
    console.log("📨 Resposta da Shopify ao PATCH:", resultText);
  } catch (err) {
    console.error("❌ Erro ao atualizar a order na Shopify:", err);
  }

  return res.send("ok");
});

// ===========================================================
//  STRIPE WEBHOOK (por enquanto só para logar)
// ===========================================================
app.post(
  "/stripe/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    console.log("💳 Stripe webhook recebido");
    // aqui mais tarde podes validar a assinatura e marcar a ordem como paga
    res.send("ok");
  }
);

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
app.listen(PORT, () => {
  console.log(`🔥 Servidor a correr na porta ${PORT}`);
});

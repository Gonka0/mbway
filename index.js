import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

console.log("🔑 STRIPE KEY EM USO:", process.env.STRIPE_SECRET);
const stripe = new Stripe(process.env.STRIPE_SECRET);

const app = express();
app.use(bodyParser.json());

// ===================================================================
//  SHOPIFY WEBHOOK: orders/create
// ===================================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida:");
  const order = req.body;

  // ---------------------------------------------------------------
  // 1. Verificar se é pagamento manual MB WAY
  // ---------------------------------------------------------------
  const gateways = order.payment_gateway_names || [];
  console.log("🔍 Gateways recebidos:", gateways);

  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → Ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado.");

  // ---------------------------------------------------------------
  // 2. Apanhar telefone do cliente
  // ---------------------------------------------------------------
  let phone =
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone ||
    null;

  if (!phone) {
    console.log("❌ Telefone não encontrado!");
    return res.status(200).send("missing phone");
  }

  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Telefone MB WAY:", phone);

  // ---------------------------------------------------------------
  // 3. Valor total da compra em cêntimos
  // ---------------------------------------------------------------
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor total:", order.total_price, "→", amount, "cêntimos");

  // ---------------------------------------------------------------
  // 4. Criar PaymentIntent MB WAY (ENVIA PEDIDO IMEDIATO)
  // ---------------------------------------------------------------
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mbway"],

      payment_method_data: {
        type: "mbway",
        mbway: {
          phone_number: phone  // <-- É AQUI QUE A STRIPE ENVIA O PEDIDO MB WAY
        }
      },

      confirm: true, // <-- ISTO GERA O PAGAMENTO DE IMEDIATO (ENVIA PUSH MBWAY)

      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name,
        customer_email: order.email || "",
      },
    });

    console.log("💳 PaymentIntent criado:", paymentIntent.id);
    console.log("📲 Status:", paymentIntent.status);

    return res.status(200).send("paymentintent criado");
  } catch (err) {
    console.log("❌ ERRO AO CRIAR PAYMENTINTENT MB WAY:");
    console.log(err);
    return res.status(500).send("erro");
  }
});

// ===================================================================
//  STRIPE WEBHOOK (opcional para confirmar pagamentos)
// ===================================================================
app.post("/stripe/webhook", (req, res) => {
  console.log("💳 Webhook Stripe recebido:");
  console.log(req.body);
  res.status(200).send("ok");
});

// ===================================================================
//  ROOT
// ===================================================================
app.get("/", (req, res) => {
  res.send("🚀 App MB WAY + Stripe + Shopify está online!");
});

// ===================================================================
//  START SERVER (Render)
// ===================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});

import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET);

const app = express();
app.use(bodyParser.json());

// ===========================================================
//  WEBHOOK — SHOPIFY: orders/create
// ===========================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida:");
  const order = req.body;

  // LOG COMPLETO DO PAYLOAD (podes remover depois)
  console.log("===== RAW ORDER JSON =====");
  console.log(JSON.stringify(order, null, 2));
  console.log("===== FIM RAW ORDER JSON =====");

  // -----------------------------------------
  // 1. DETETAR SE É PAGAMENTO MB WAY
  // -----------------------------------------
  const gateways = order.payment_gateway_names || [];
  console.log("🔍 Gateways recebidos:", gateways);

  const isMBWAY =
    gateways.some((g) =>
      g.toLowerCase().includes("mb way") ||
      g.toLowerCase().includes("mbway") ||
      g.toLowerCase().includes("mb_way")
    );

  if (!isMBWAY) {
    console.log("⛔ Não é pagamento MB WAY. Ignorado.");
    return res.status(200).send("ignored");
  }

  console.log("✔ Método MB WAY confirmado.");

  // -----------------------------------------
  // 2. EXTRAIR O NÚMERO DE TELEFONE DA ENCOMENDA
  // (ainda não o vamos enviar para a Stripe, mas já fica pronto)
  // -----------------------------------------
  let phone = null;

  if (order.billing_address?.phone) {
    phone = order.billing_address.phone;
  } else if (order.shipping_address?.phone) {
    phone = order.shipping_address.phone;
  } else if (order.phone) {
    phone = order.phone;
  }

  if (!phone) {
    console.log("❌ ERRO: A Shopify não enviou número de telefone!");
    return res.status(200).send("missing phone");
  }

  // limpar número
  phone = phone.replace(/\s+/g, "");
  console.log("📱 Número (bruto) da Shopify:", phone);

  // -----------------------------------------
  // 3. VALOR TOTAL EM CÊNTIMOS
  // -----------------------------------------
  const amount = Math.round(parseFloat(order.total_price) * 100);

  console.log("💶 Valor (EUR):", order.total_price);
  console.log("💶 Valor (centimos):", amount);

  // -----------------------------------------
  // 4. CRIAR PAYMENT INTENT MB WAY — FORMATO EXACTO DOCS STRIPE
  // -----------------------------------------
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mb_way"], // <- EXACTAMENTE assim
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name,
        mbway_phone_from_shopify: phone, // só para referência
      },
    });

    console.log("💳 PaymentIntent MB WAY criado com sucesso:");
    console.log(paymentIntent);

    return res.status(200).send("MB WAY PaymentIntent criado");
  } catch (err) {
    console.log("❌ ERRO AO CRIAR MB WAY:");
    console.log("type:", err.type);
    console.log("code:", err.code);
    console.log("statusCode:", err.statusCode);
    console.log("message:", err.message);
    console.log("raw:", err.raw);
    return res.status(500).send("erro stripe");
  }
});

// ===========================================================
//  WEBHOOK — STRIPE
// ===========================================================
app.post("/stripe/webhook", (req, res) => {
  console.log("💳 Webhook Stripe recebido:");
  console.log(req.body);
  res.status(200).send("ok");
});

// ===========================================================
//  ROOT
// ===========================================================
app.get("/", (req, res) => {
  res.send("PaymentsBridge está online 🚀");
});

// ===========================================================
//  START SERVER (Render)
// ===========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});

import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET);

const app = express();
app.use(bodyParser.json());

// ===================================================================
//  WEBHOOK — SHOPIFY: orders/create
// ===================================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida:");
  const order = req.body;

  // DEBUG — VER O PAYLOAD COMPLETO (remove depois)
  console.log("===== RAW ORDER JSON =====");
  console.log(JSON.stringify(order, null, 2));
  console.log("===== FIM RAW ORDER JSON =====");

  // ---------------------------------------------------------------
  // 1. DETETAR SE É PAGAMENTO MANUAL "MB WAY"
  // ---------------------------------------------------------------
  const gateways = order.payment_gateway_names || [];
  console.log("🔍 Gateways recebidos:", gateways);

  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é pagamento MB WAY. Ignorado.");
    return res.status(200).send("ignored");
  }

  console.log("✔ Método MB WAY confirmado.");

  // ---------------------------------------------------------------
  // 2. VALOR TOTAL EM CÊNTIMOS
  // ---------------------------------------------------------------
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor da encomenda (centimos):", amount);

  // ---------------------------------------------------------------
  // 3. CRIAR STRIPE CHECKOUT SESSION (MB WAY)
  // ---------------------------------------------------------------
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["mb_way"],

      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Pagamento MB WAY - Pedido " + order.name,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],

      // URLs após pagamento
      success_url: `https://a-tua-loja.com/success?order_id=${order.id}`,
      cancel_url: `https://a-tua-loja.com/cancel?order_id=${order.id}`,

      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name,
      },
    });

    console.log("💳 Checkout Session criada:");
    console.log("🔗 URL:", session.url);

    // Aqui podes:
    // - enviar SMS
    // - enviar email
    // - guardar em note_attributes da Shopify
    // - mostrar ao cliente automaticamente

    return res.status(200).send("Checkout Session MB WAY criada");
  } catch (err) {
    console.log("❌ ERRO AO CRIAR CHECKOUT SESSION MB WAY:");
    console.log(err);
    return res.status(500).send("erro");
  }
});

// ===================================================================
//  WEBHOOK — STRIPE (pagamento confirmado, falhado, etc.)
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
  res.send("Stripe MB WAY App está online 🚀");
});

// ===================================================================
//  START SERVER (Render)
// ===================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});

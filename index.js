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
  // 2. Valor total da achat em cêntimos
  // ---------------------------------------------------------------
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor total:", order.total_price, "→", amount, "cêntimos");

  // ---------------------------------------------------------------
  // 3. Criar Stripe Checkout Session com MB WAY
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

      success_url: `https://A-TUA-LOJA.com/sucesso?order_id=${order.id}`,
      cancel_url: `https://A-TUA-LOJA.com/cancelado?order_id=${order.id}`,

      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name,
        customer_email: order.email || "",
      },
    });

    console.log("💳 Checkout Session MB WAY criada com sucesso!");
    console.log("🔗 URL:", session.url);

    // Aqui podes enviar ao cliente por email/SMS se quiseres

    return res.status(200).send("checkout session criada");
  } catch (err) {
    console.log("❌ ERRO AO CRIAR CHECKOUT SESSION MB WAY:");
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

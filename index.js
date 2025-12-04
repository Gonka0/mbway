import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET);

const app = express();
app.use(bodyParser.json());

// --- WEBHOOK SHOPIFY ---
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida:");
  const order = req.body;

  try {
    // Valor total em cêntimos
    const amount = Math.round(parseFloat(order.total_price) * 100);

    console.log("💶 Valor da encomenda (EUR):", order.total_price);
    console.log("💶 Valor convertido (centimos):", amount);

    // Criar o PaymentIntent MB WAY
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mbway"],
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name
      }
    });

    console.log("💳 PaymentIntent MB WAY criado:");
    console.log(paymentIntent);

    res.status(200).send("MB Way criado");
  } catch (err) {
    console.log("❌ ERRO AO CRIAR MB WAY");
    console.log(err);
    res.status(500).send("erro");
  }
});

// --- WEBHOOK STRIPE ---
app.post("/stripe/webhook", (req, res) => {
  console.log("💳 Webhook Stripe recebido:");
  console.log(req.body);
  res.status(200).send("ok");
});

// ROOT
app.get("/", (req, res) => {
  res.send("PaymentsBridge está online 🚀");
});

// PORT PARA O RENDER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});



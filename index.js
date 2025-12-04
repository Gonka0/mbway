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

  // 1. Verificar se o método manual é MB WAY
  const manualMethodName = order.payment_terms?.payment_terms_name || "";
  console.log("🔍 Método manual detetado:", manualMethodName);

  if (manualMethodName.toLowerCase() !== "mb way") {
    console.log("⛔ Não é pagamento MB WAY. Ignorado.");
    return res.status(200).send("ignored");
  }

  console.log("✔ Método MB WAY confirmado.");

  // 2. Apanhar o número de telefone da Shopify
  let phone = null;

  if (order.billing_address?.phone) {
    phone = order.billing_address.phone;
  } else if (order.shipping_address?.phone) {
    phone = order.shipping_address.phone;
  } else if (order.phone) {
    phone = order.phone;
  }

  if (!phone) {
    console.log("❌ ERRO: A Shopify não enviou telefone!");
    return res.status(200).send("missing phone");
  }

  // limpar o número
  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Número MB WAY:", phone);

  // 3. Valor total em cêntimos
  const amount = Math.round(parseFloat(order.total_price) * 100);

  console.log("💶 Valor (EUR):", order.total_price);
  console.log("💶 Valor (centimos):", amount);

  try {
    // 4. Criar PaymentIntent MB WAY com número incluído
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "eur",
      payment_method_types: ["mbway"],
      payment_method_data: {
        type: "mbway",
        mbway: {
          phone_number: phone
        }
      },
      metadata: {
        shopify_order_id: order.id,
        shopify_order_number: order.name
      }
    });

    console.log("💳 PaymentIntent MB WAY criado:");
    console.log(paymentIntent);

    res.status(200).send("MB WAY enviado");
  } catch (err) {
    console.log("❌ ERRO MB WAY:");
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


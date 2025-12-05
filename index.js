import express from "express";
import bodyParser from "body-parser";
import Stripe from "stripe";

const app = express();
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET);

// TESTE DIRETO AO PAYMENT INTENT (MB WAY)
app.get("/test-mbway", async (req, res) => {
  try {
    console.log("🧪 TESTE: Criar PaymentIntent MB WAY...");

    const phone = "932000000"; // <-- troca para um número TEU real

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100, // 1€
      currency: "eur",
      payment_method_types: ["mbway"],
      payment_method_data: {
        type: "mbway",
        mbway: {
          phone_number: phone
        }
      },
      confirm: true, // dispara o pedido MB WAY
      metadata: {
        test: "mbway"
      }
    });

    console.log("💳 PaymentIntent criado:", paymentIntent.id);

    res.json({
      ok: true,
      id: paymentIntent.id,
      status: paymentIntent.status,
      next_action: paymentIntent.next_action || null
    });

  } catch (err) {
    console.error("❌ ERRO MB WAY:", err);
    res.status(500).json({
      ok: false,
      error: err.message,
      details: err.raw || err
    });
  }
});

app.get("/", (req, res) => {
  res.send("MB WAY PaymentIntent tester online 🚀");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🔥 Servidor Stripe MB WAY ativo");
});

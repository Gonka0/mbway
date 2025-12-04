import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// --- WEBHOOK SHOPIFY ---
app.post("/shopify/orders/create", (req, res) => {
  console.log("📦 Nova ordem Shopify recebida:");
  console.log(req.body);
  res.status(200).send("ok");
});

// --- WEBHOOK STRIPE ---
app.post("/stripe/webhook", (req, res) => {
  console.log("💳 Webhook Stripe recebido:");
  console.log(req.body);
  res.status(200).send("ok");
});

app.get("/", (req, res) => {
  res.send("PaymentsBridge está online 🚀");
});

// PORT para o Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Servidor ativo na porta ${PORT}`);
});



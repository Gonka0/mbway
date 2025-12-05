import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// ----------------------------------------------------------
// CONFIG VIVA WALLET
// ----------------------------------------------------------
const VIVA_MERCHANT_ID = process.env.VIVA_MERCHANT_ID;
const VIVA_API_KEY = process.env.VIVA_API_KEY;
const VIVA_BASE_URL = "https://api.vivapayments.com"; // LIVE

// ----------------------------------------------------------
// SHOPIFY WEBHOOK — orders/create
// ----------------------------------------------------------
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida");

  const order = req.body;

  // 1. verificar gateway manual MB WAY
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado");

  // 2. apanhar telefone
  let phone = order.billing_address?.phone || order.phone || null;
  if (!phone) {
    console.log("❌ Telefone não encontrado");
    return res.status(200).send("missing phone");
  }

  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Telefone MB WAY:", phone);

  // 3. valor total
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Total:", amount);

  // 4. criar pagamento MB WAY via Viva
  try {
    const response = await fetch(`${VIVA_BASE_URL}/checkout/v2/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(VIVA_API_KEY).toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: amount,
        customerTrns: `Pedido ${order.name}`,
        customer: {
          email: order.email,
          phone: phone
        },
        sourceCode: "Default",
        paymentNotification: true,
        fullName: order.billing_address?.first_name + " " + order.billing_address?.last_name
      })
    });

    const data = await response.json();
    console.log("💳 VivaWallet Order criada:", data);

    if (!data.orderCode) {
      console.log("❌ Erro ao criar order na Viva:", data);
      return res.status(500).send("erro");
    }

    // 5. ENVIAR PUSH MBWAY AUTOMÁTICO
    const paymentRequest = await fetch(`${VIVA_BASE_URL}/checkout/v2/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(VIVA_API_KEY).toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderCode: data.orderCode,
        paymentMethod: "mbway",
        phoneNumber: phone
      })
    });

    const payData = await paymentRequest.json();
    console.log("📲 PUSH MB WAY ENVIADO:", payData);

    return res.status(200).send("mbway enviado");
  } catch (err) {
    console.log("❌ ERRO MBWAY:", err);
    return res.status(500).send("erro");
  }
});

// ROOT
app.get("/", (_, res) => {
  res.send("VivaWallet MB WAY App online 🚀");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🔥 Servidor iniciado");
});

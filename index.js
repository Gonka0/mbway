import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ----------------------------------------------------------
// CONFIG VIVA WALLET (via Render Env Vars)
// ----------------------------------------------------------
const VIVA_MERCHANT_ID = process.env.VIVA_MERCHANT_ID;
const VIVA_API_KEY = process.env.VIVA_API_KEY;

// LIVE API URL
const VIVA_BASE_URL = "https://api.vivapayments.com"; 

// Helpers
const getAuthHeader = () =>
  "Basic " + Buffer.from(VIVA_API_KEY + ":").toString("base64");

// ----------------------------------------------------------
// SHOPIFY WEBHOOK — orders/create
// ----------------------------------------------------------
app.post("/shopify/orders/create", async (req, res) => {
  console.log("📦 Nova ordem Shopify recebida");

  const order = req.body;

  // 1. Detectar gateway MB WAY
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) {
    console.log("⛔ Não é MB WAY → ignorado");
    return res.status(200).send("ignored");
  }

  console.log("✔ MB WAY detectado");

  // 2. Apanhar telefone
  let phone =
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone ||
    null;

  if (!phone) {
    console.log("❌ Telefone não encontrado na Shopify");
    return res.status(200).send("missing phone");
  }

  // Limpar número
  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Telefone MB WAY:", phone);

  // 3. Valor total em cêntimos
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor da encomenda:", amount);

  try {
    // ------------------------------------------------------
    // 4. Criar ORDER na Viva Wallet
    // ------------------------------------------------------
    const orderResponse = await fetch(`${VIVA_BASE_URL}/checkout/v2/orders`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount,
        customerTrns: `Pedido ${order.name}`,
        customer: {
          email: order.email,
          phone: phone,
        },
        sourceCode: "Default",
        merchantTrns: `Shopify ${order.name}`,
        paymentNotification: true,
        fullName:
          (order.billing_address?.first_name || "") +
          " " +
          (order.billing_address?.last_name || ""),
      }),
    });

    const orderData = await orderResponse.json();
    console.log("💳 VivaWallet ORDER criada:", orderData);

    if (!orderData.orderCode) {
      console.log("❌ Erro ao criar ORDER:", orderData);
      return res.status(500).send("erro order");
    }

    const orderCode = orderData.orderCode;

    // ------------------------------------------------------
    // 5. ENVIAR PUSH MB WAY automático
    // ------------------------------------------------------
    const paymentResponse = await fetch(
      `${VIVA_BASE_URL}/checkout/v2/transactions`,
      {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderCode: orderCode,
          paymentMethod: "mbway",
          phoneNumber: phone,
        }),
      }
    );

    const paymentData = await paymentResponse.json();
    console.log("📲 PUSH MB WAY enviado:", paymentData);

    return res.status(200).send("mbway enviado");
  } catch (err) {
    console.log("❌ ERRO MB WAY:", err);
    return res.status(500).send("erro geral");
  }
});

// ----------------------------------------------------------
// ROOT
// ----------------------------------------------------------
app.get("/", (req, res) => {
  res.send("VivaWallet MB WAY App online 🚀");
});

// ----------------------------------------------------------
// START SERVER
// ----------------------------------------------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("🔥 Servidor ativo na porta " + (process.env.PORT || 3000));
});

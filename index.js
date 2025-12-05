import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// ENV
const VIVA_MERCHANT_ID = process.env.VIVA_MERCHANT_ID;
const VIVA_API_KEY = process.env.VIVA_API_KEY;

const VIVA_BASE_URL = "https://api.vivapayments.com";

// AUTH header
const getAuthHeaders = () => ({
  "Authorization": "Basic " + Buffer.from(VIVA_API_KEY + ":").toString("base64"),
  "Content-Type": "application/json"
});

// SAFE JSON PARSE
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text || null };
  }
}

// ==========================================================
// SHOPIFY WEBHOOK - orders/create
// ==========================================================
app.post("/shopify/orders/create", async (req, res) => {
  console.log("\n/////////////////////////////////////////");
  console.log("📦 Nova ordem Shopify recebida");

  const order = req.body;

  // Detectar MB WAY
  const gateways = order.payment_gateway_names || [];
  const isMBWAY = gateways.some(g =>
    g.toLowerCase().includes("mb") || g.toLowerCase().includes("way")
  );

  if (!isMBWAY) return res.status(200).send("ignored");

  console.log("✔ MB WAY detectado");

  // Telefone
  let phone =
    order.billing_address?.phone ||
    order.shipping_address?.phone ||
    order.phone ||
    null;

  if (!phone) return res.status(200).send("missing phone");

  phone = phone.replace(/\s+/g, "").replace(/^\+351/, "");
  console.log("📱 Telefone MB WAY:", phone);

  // Valor
  const amount = Math.round(parseFloat(order.total_price) * 100);
  console.log("💶 Valor da encomenda:", amount);

  try {
    // ------------------------------------------------------
    // 1. Criar ORDER na Viva Wallet
    // ------------------------------------------------------
    const orderRes = await fetch(`${VIVA_BASE_URL}/checkout/v2/orders`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        amount: amount,
        customerTrns: `Pedido ${order.name}`,
        merchantTrns: `Shopify ${order.name}`,
        merchantId: VIVA_MERCHANT_ID,   // <-- CORREÇÃO AQUI
        customer: {
          email: order.email,
          phone: phone
        },
        sourceCode: "Default",
        paymentNotification: true
      })
    });

    const orderData = await safeJson(orderRes);
    console.log("💳 ORDER response:", orderData);

    if (!orderData.orderCode) {
      console.log("❌ ERRO: Viva Wallet não retornou orderCode");
      return res.status(500).send("erro-order");
    }

    const orderCode = orderData.orderCode;

    // ------------------------------------------------------
    // 2. Enviar PUSH MB WAY
    // ------------------------------------------------------
    const payRes = await fetch(`${VIVA_BASE_URL}/checkout/v2/transactions`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        orderCode: orderCode,
        paymentMethod: "mbway",
        phoneNumber: phone,
        merchantId: VIVA_MERCHANT_ID   // <-- CORREÇÃO AQUI TBM
      })
    });

    const payData = await safeJson(payRes);
    console.log("📲 PUSH MB WAY enviado:", payData);

    return res.status(200).send("mbway enviado");

  } catch (err) {
    console.log("❌ ERRO MB WAY:", err);
    return res.status(500).send("erro");
  }
});

app.get("/", (req, res) => {
  res.send("VivaWallet MB WAY App online 🚀");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🔥 Servidor ativo");
});

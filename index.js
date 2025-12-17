import express from "express";


const app = express();

// Shopify envia JSON
app.use(express.json());

/**
 * WEBHOOK: Order updated
 * Shopify → espera Multibanco → envia SMS EZ4U
 */
app.post("/webhooks/shopify-order-updated", async (req, res) => {
  const order = req.body;

  // Responder IMEDIATAMENTE ao Shopify
  res.sendStatus(200);

  try {
    // Só Shopify Payments (Multibanco)
    if (!order.payment_gateway_names?.includes("shopify_payments")) {
      console.log("Ignorado: não é Shopify Payments");
      return;
    }

    console.log("Order recebida:", order.id);

    // Esperar para a referência Multibanco ser criada
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Buscar order completa (com transactions)
    const shopifyResponse = await fetch(
      `https://arion-lisboa.myshopify.com/admin/api/2023-10/orders/${order.id}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    if (!shopifyResponse.ok) {
      console.error("Erro ao buscar order:", shopifyResponse.status);
      return;
    }

    const data = await shopifyResponse.json();
    const transactions = data.order.transactions || [];

    // Procurar transaction com Multibanco
    const mbTransaction = transactions.find(
      t => t.receipt && t.receipt.multibanco_reference
    );

    if (!mbTransaction) {
      console.log("Ainda sem referência Multibanco");
      return;
    }

    const {
      multibanco_entity,
      multibanco_reference,
      amount
    } = mbTransaction.receipt;

    // Telefone do cliente
    const phone =
      order.phone ||
      order.customer?.phone ||
      order.shipping_address?.phone;

    if (!phone) {
      console.log("Sem telefone, SMS não enviado");
      return;
    }

    // Preparar autenticação EZ4U
    const ez4uAuth = Buffer.from(
      `${process.env.EZ4U_USER}:${process.env.EZ4U_PASS}`
    ).toString("base64");

    // Enviar SMS
    const smsResponse = await fetch(
      "https://dashboard.ez4uteam.com/api/rest/sms",
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${ez4uAuth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: [phone.replace(/\D/g, "")],
          from: "LumaLine",
          message:
            `Pagamento Multibanco\n` +
            `Entidade ${multibanco_entity}\n` +
            `Ref ${multibanco_reference}\n` +
            `Valor ${amount}€`
        })
      }
    );

    if (!smsResponse.ok) {
      const errText = await smsResponse.text();
      console.error("Erro EZ4U:", smsResponse.status, errText);
      return;
    }

    console.log("SMS enviado com sucesso para", phone);

  } catch (err) {
    console.error("Erro geral:", err);
  }
});

// Porta para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

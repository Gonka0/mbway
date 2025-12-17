import express from "express";

const app = express();
app.use(express.json());

app.post("/webhooks/shopify-order-updated", async (req, res) => {
  const order = req.body;

  // responder logo ao Shopify
  res.sendStatus(200);

  try {
    if (!order.payment_gateway_names?.includes("shopify_payments")) {
      console.log("Ignorado: não é Shopify Payments");
      return;
    }

    console.log("Order recebida:", order.id);

    const maxAttempts = 6;
    const delayMs = 15000;

    let mbTransaction = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Tentativa ${attempt}/${maxAttempts} — a verificar Multibanco`);

      const response = await fetch(
        `https://arion-lisboa.myshopify.com/admin/api/2023-10/orders/${order.id}.json`,
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        console.error("Erro Shopify:", response.status);
        return;
      }

      const data = await response.json();
      const transactions = data.order.transactions || [];

      mbTransaction = transactions.find(
        t => t.receipt && t.receipt.multibanco_reference
      );

      if (mbTransaction) {
        console.log("Referência Multibanco encontrada");
        break;
      }

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    if (!mbTransaction) {
      console.log("Multibanco não apareceu após todas as tentativas");
      return;
    }

    const {
      multibanco_entity,
      multibanco_reference,
      amount
    } = mbTransaction.receipt;

    const phone =
      order.phone ||
      order.customer?.phone ||
      order.shipping_address?.phone;

    if (!phone) {
      console.log("Sem telefone, SMS não enviado");
      return;
    }

    const ez4uAuth = Buffer.from(
      `${process.env.EZ4U_USER}:${process.env.EZ4U_PASS}`
    ).toString("base64");

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
      const err = await smsResponse.text();
      console.error("Erro EZ4U:", smsResponse.status, err);
      return;
    }

    console.log("SMS enviado com sucesso para", phone);

  } catch (err) {
    console.error("Erro geral:", err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

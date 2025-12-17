import express from "express";

const app = express();
app.use(express.json());

// === FUNÇÃO: ir buscar Multibanco via GraphQL ===
async function fetchMultibanco(orderId) {
  const query = `
    query ($id: ID!) {
      order(id: $id) {
        transactions {
          gateway
          amount
          buyerPendingPaymentInstructions {
            header
            value
          }
        }
      }
    }
  `;

  const response = await fetch(
    "https://luma-line.myshopify.com/admin/api/2023-10/graphql.json",
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: {
          id: `gid://shopify/Order/${orderId}`
        }
      })
    }
  );

  const json = await response.json();

  if (!json?.data?.order?.transactions) return null;

  const tx = json.data.order.transactions.find(
    t => t.buyerPendingPaymentInstructions?.length
  );

  if (!tx) return null;

  const instructions = Object.fromEntries(
    tx.buyerPendingPaymentInstructions.map(i => [i.header, i.value])
  );

  return {
    entity: instructions["Entidade"] || instructions["Entity"],
    reference: instructions["Referência"] || instructions["Reference"],
    amount: tx.amount
  };
}

// === WEBHOOK ===
app.post("/webhooks/shopify-order-updated", async (req, res) => {
  const order = req.body;

  // responder imediatamente ao Shopify
  res.sendStatus(200);

  try {
    if (!order.payment_gateway_names?.includes("shopify_payments")) {
      console.log("Ignorado: não é Shopify Payments");
      return;
    }

    console.log("Order recebida:", order.id);

    const maxAttempts = 8;
    const delayMs = 15000;
    let mb = null;

    for (let i = 1; i <= maxAttempts; i++) {
      console.log(`Tentativa ${i}/${maxAttempts} — a procurar Multibanco`);

      mb = await fetchMultibanco(order.id);

      if (mb) break;

      await new Promise(r => setTimeout(r, delayMs));
    }

    if (!mb) {
      console.log("❌ Multibanco não encontrado após todas as tentativas");
      return;
    }

    // === LOGS DE TESTE ===
    console.log("✅ MULTIBANCO ENCONTRADO");
    console.log("Entidade:", mb.entity);
    console.log("Referência:", mb.reference);
    console.log("Valor:", mb.amount, "EUR");

    // telefone
    const phone =
      order.phone ||
      order.customer?.phone ||
      order.shipping_address?.phone;

    if (!phone) {
      console.log("Sem telefone, SMS não enviado");
      return;
    }

    // autenticação EZ4U
    const ez4uAuth = Buffer.from(
      `${process.env.EZ4U_USER}:${process.env.EZ4U_PASS}`
    ).toString("base64");

    // enviar SMS
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
            `Entidade ${mb.entity}\n` +
            `Ref ${mb.reference}\n` +
            `Valor ${mb.amount}€`
        })
      }
    );

    if (!smsResponse.ok) {
      const err = await smsResponse.text();
      console.error("Erro EZ4U:", smsResponse.status, err);
      return;
    }

    console.log("📩 SMS enviado com sucesso para", phone);

  } catch (err) {
    console.error("Erro geral:", err);
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

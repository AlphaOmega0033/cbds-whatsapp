import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TOKEN = process.env.TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// Verify webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// Receive messages
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const msg = change?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    if (msg.type === 'interactive') {
      const i = msg.interactive;
      if (i.type === 'list_reply') {
        const id = i.list_reply.id;
        if (id.startsWith('t_')) { await sendIntake(from); await sendXrayButtons(from); }
        else if (id === 's_have_xrays') { await askForXrays(from); }
        else if (id === 's_no_xrays') { await askForPhotos(from); }
        else { await sendMenu(from); }
      } else if (i.type === 'button_reply') {
        const id = i.button_reply.id;
        if (id === 'b_upload_xrays') await askForXrays(from);
        if (id === 'b_send_photos') await askForPhotos(from);
        if (id === 'b_book_exam') await offerExamDates(from);
        if (id === 'cta_book') await askToBook(from);
        if (id === 'cta_dates') await sendText(from, 'Please share your available dates and arrival airport ✈️');
        if (id === 'cta_payments') await sendPayments(from);
      }
    } else if (msg.type === 'text') {
      await sendMenu(from);
    } else if (msg.image || msg.document) {
      await sendText(from, 'Thanks! We received your file(s). Our team will review and follow up shortly.');
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200);
  }
});

async function sendMenu(to) {
  const body = {
    messaging_product: "whatsapp",
    to, type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "Cross-Border Dental Solutions" },
      body: { text: "Hi! 👋 To get you a quick estimate, choose below or type your question.\n\n¡Hola! 👋 Para un estimado rápido, elija abajo o escriba su consulta." },
      footer: { text: "Los Algodones • Certified Dentists • Free Airport Pickup" },
      action: {
        button: "Select / Seleccionar",
        sections: [
          { title: "Treatments / Tratamientos", rows: [
            { id: "t_implants", title: "Dental Implants" },
            { id: "t_allon4", title: "All-on-4 / All-on-6" },
            { id: "t_crowns", title: "Crowns / Bridges" },
            { id: "t_veneers", title: "Veneers" },
            { id: "t_dentures", title: "Dentures / Partials" },
            { id: "t_root", title: "Root Canal" },
            { id: "t_clean", title: "Cleaning / Checkup" },
            { id: "t_other", title: "Other / Not sure" }
          ]},
          { title: "Status / Estado", rows: [
            { id: "s_have_xrays", title: "I have X-rays" },
            { id: "s_no_xrays", title: "I don’t have X-rays" }
          ]}
        ]
      }
    }
  };
  await send(body);
}

async function sendIntake(to) {
  const text = "Great—so we can tailor an accurate estimate, please share:\n1) Treatment or problem area\n2) X-rays or plan (if available)\n3) Preferred travel/visit dates\n4) Medical conditions/allergies\n5) Budget & payment (Cash, Card, PayPal, Klarna/Afterpay*)\n6) Free airport pickup? (Yes/No)\n\n*Select services qualify for Klarna/Afterpay.\n\nEspañol:\n1) Tratamiento o zona con problema\n2) Radiografías o plan (si tiene)\n3) Fechas preferidas para viajar/visitar\n4) Condiciones médicas/alergias\n5) Presupuesto y pago (Efectivo, Tarjeta, PayPal, Klarna/Afterpay*)\n6) ¿Traslado gratuito desde el aeropuerto? (Sí/No)";
  await sendText(to, text);
}

async function sendXrayButtons(to) {
  const body = {
    messaging_product: "whatsapp",
    to, type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Do you have X-rays/photos?\n¿Tiene radiografías o fotos?" },
      action: { buttons: [
        { type: "reply", reply: { id: "b_upload_xrays", title: "Upload X-rays" } },
        { type: "reply", reply: { id: "b_send_photos", title: "Send photos" } },
        { type: "reply", reply: { id: "b_book_exam", title: "Book in-clinic exam" } }
      ]}
    }
  };
  await send(body);
}

async function askForXrays(to) {
  const text = "Please upload your X-rays and any treatment plan/estimate here. If you know tooth numbers or areas, include them.\n\nPor favor suba sus radiografías y cualquier plan/estimado aquí. Si sabe los números de piezas o zonas, inclúyalos.";
  await sendText(to, text);
}

async function askForPhotos(to) {
  const text = "No problem—please share 2–3 clear photos of your smile/concern (front, left, right) and tell us symptoms (pain/sensitivity). We’ll provide a preliminary range and may recommend an in-clinic evaluation in Los Algodones.\n\nNo hay problema—envíe 2–3 fotos claras (frente, izquierda, derecha) y cuéntenos los síntomas. Daremos un rango preliminar y quizá recomendemos una evaluación en clínica en Los Algodones.";
  await sendText(to, text);
}

async function offerExamDates(to) {
  const text = "Great—please share the dates you can visit, and we’ll book your in‑clinic evaluation in Los Algodones with a certified dentist.\nWe’ll also arrange FREE airport pickup, and check hotel‑included options for select treatments.\n\nExcelente—comparta las fechas en que puede visitar y agendamos su evaluación en clínica en Los Algodones con un dentista certificado.\nCoordinamos traslado GRATIS desde el aeropuerto y revisamos opciones con hotel incluido (según tratamiento).";
  await sendText(to, text);
}

async function askToBook(to) {
  const text = "Would you like us to lock in an appointment with the best‑fit certified dentist for your case?\nShare your arrival date/airport and we’ll coordinate FREE pickup and check hotel‑included options for your dates.\n\n¿Desea agendar con el dentista certificado más adecuado?\nComparta su fecha/aeropuerto de llegada; coordinamos traslado GRATIS y verificamos hotel incluido según sus fechas.";
  await sendText(to, text);
}

async function sendPayments(to) {
  const text = "Payment options: Cash, Debit/Credit, PayPal, and (select services) Klarna/Afterpay.\nWe’ll also handle free airport transportation and can include hotel on select treatments.\n\nFormas de pago: Efectivo, Tarjeta, PayPal y (según servicio) Klarna/Afterpay.\nTambién traslado gratis y hotel en ciertos tratamientos.";
  await sendText(to, text);
}

async function sendText(to, bodyText) {
  const body = { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: bodyText } };
  await send(body);
}
async function send(payload) {
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Send error', res.status, err);
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('CBDS WhatsApp webhook listening on', port));

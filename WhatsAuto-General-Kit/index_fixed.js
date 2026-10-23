

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'my_hut_033_verify';

const FLOWS = {
  welcome: `Hi 👋 {{name}}! Welcome to The Nutrition Hut Ludhiana 🙏\nSupplements | Diet Plan | Gym Advice\nNeeche se option chuno 👇`,
  menu_buttons: [
    {id: "price", title: "💰 Price / Services"},
    {id: "location", title: "📍 Location / Address"},
    {id: "human", title: "👨‍💼 Talk to Human"},
    {id: "payment", title: "💳 Payment Link"}
  ],
  keywords: {
    price: ["price", "rate", "kitne ka", "charges", "cost", "daam", "whey", "protein", "creatine", "gainer"],
    location: ["location", "kahan", "address", "kha pe", "route", "ludhiana"],
    human: ["human", "bhaiya", "sir", "talk", "call", "insaan", "manish"]
  },
  replies: {
    price: "The Nutrition Hut - Price List:\nWhey Protein: 3500 onwards\nCreatine: 1200\nMass Gainer: 4000\nDiet Plan: FREE with supplement\n\n'Location' likho shop pe aane ke liye.",
    location: "📍 The Nutrition Hut, Ludhiana, Punjab.\nGoogle Map: https://maps.google.com\nTiming: 10AM - 9PM Open",
    human: "Bilkul, Manish bhaiya 2 min me aapse connect karte hain. Aap apna naam bhej dijiye.",
    payment: "UPI Payment: UPI ID pe bhej ke screenshot share kar do."
  }
};

async function sendMessage(to, text, buttons=null){
  let data = {
    messaging_product: "whatsapp",
    to: to,
    type: buttons ? "interactive" : "text",
  };
  if(buttons){
    data.interactive = {
      type: "button",
      body: { text: text },
      action: { buttons: buttons.map(b=>({type:"reply", reply:{id:b.id, title:b.title}})) }
    };
  } else {
    data.text = { body: text };
  }
  await axios.post(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, data, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

app.get("/", (req,res)=> res.send("Bot is Live - Nutrition Hut"));

app.get("/webhook", (req,res)=>{
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if(mode && token){
    if(token === VERIFY_TOKEN){
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else res.sendStatus(403);
  } else res.sendStatus(400);
});

app.post("/webhook", async (req,res)=>{
  try{
    const msgObj = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if(!msgObj) return res.sendStatus(200);
    const from = msgObj.from;
    const text = (msgObj.text?.body || msgObj.button?.text || "").toLowerCase();
    const name = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Dost";
    console.log("New Lead:", from, text);
    let found = null;
    for(let key in FLOWS.keywords){
      if(FLOWS.keywords[key].some(k=>text.includes(k))) { found = key; break; }
    }
    if(!found && (text.includes("hi") || text.includes("hello") || text.includes("hey") || text.includes("hii"))){
      await sendMessage(from, FLOWS.welcome.replace("{{name}}", name), FLOWS.menu_buttons);
    } else if(found){
      await sendMessage(from, FLOWS.replies[found]);
    } else {
      await sendMessage(from, "Samajh gaya 👍 'Price' likho rate ke liye, 'Location' likho shop ke liye, ya 'Human' likh ke direct baat karo.");
    }
    res.sendStatus(200);
  }catch(e){ console.error(e.response?.data || e.message); res.sendStatus(200); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("WhatsAuto running on", PORT));


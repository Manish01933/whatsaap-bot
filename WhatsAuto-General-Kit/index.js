
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;

// --- GENERAL FLOW CONFIG - HAR BUSINESS KE LIYE ---
const FLOWS = {
  welcome: `Hi 👋 {{name}}! 
Welcome to {{businessName}} 🙏
Neeche se option chuno 👇`,

  menu_buttons: [
    {id: "price", title: "💰 Price / Services"},
    {id: "location", title: "📍 Location / Address"},
    {id: "human", title: "👨‍💼 Talk to Human"},
    {id: "payment", title: "💳 Payment Link"}
  ],

  keywords: {
    price: ["price", "rate", "kitne ka", "charges", "cost", "daam", "paisa"],
    location: ["location", "kahan", "address", "kha pe", "route"],
    human: ["human", "bhaiya", "sir", "talk", "call", "insaan"]
  },

  replies: {
    price: "Hamari services / products ki list ye rahi:\n1. Basic - 999\n2. Standard - 1999\n3. Premium - 3499\n\nDetails ke liye 'human' likho.",
    location: "📍 Hamari location: Ludhiana, Punjab. Google Map: https://maps.google.com\nTiming: 10AM - 8PM",
    human: "Bilkul, hamari team 2 min me aapse connect karti hai. Aap apna naam bhej dijiye.",
    payment: "UPI / Payment Link: razorpay.me/yourshop - Screenshot bhej dena payment ke baad."
  }
};

// --- SEND FUNCTION ---
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

// --- WEBHOOK VERIFY ---
app.get("/webhook", (req,res)=>{
  if(req.query["hub.verify_token"] === process.env.VERIFY_TOKEN){
    res.send(req.query["hub.challenge"]);
  } else res.sendStatus(403);
});

// --- WEBHOOK RECEIVE ---
app.post("/webhook", async (req,res)=>{
  try{
    const msgObj = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if(!msgObj) return res.sendStatus(200);
    const from = msgObj.from;
    const text = (msgObj.text?.body || "").toLowerCase();
    const name = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || "Dost";

    console.log("New Lead:", from, text);
    // Yahan DB / Google Sheet me save karo lead ko

    // Keyword Engine
    let found = null;
    for(let key in FLOWS.keywords){
      if(FLOWS.keywords[key].some(k=>text.includes(k))) { found = key; break; }
    }

    if(!found && (text.includes("hi") || text.includes("hello") || text.includes("hey"))){
      // Welcome Menu
      await sendMessage(from, FLOWS.welcome.replace("{{name}}", name).replace("{{businessName}}","Your Business"), FLOWS.menu_buttons);
    } else if(found){
      await sendMessage(from, FLOWS.replies[found]);
    } else {
      // AI Fallback - General Business Assistant
      // const ai = await openai.chat.completions.create({...})
      await sendMessage(from, "Samajh gaya 👍 Hamari team aapki madad karegi. Aap 'Price' ya 'Location' likh ke quick info le sakte ho, ya 'Human' likh ke direct baat kar sakte ho.");
    }

    res.sendStatus(200);
  }catch(e){ console.error(e.response?.data || e.message); res.sendStatus(200); }
});

app.listen(3000, ()=> console.log("WhatsAuto running on 3000"));

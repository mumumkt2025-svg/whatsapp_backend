// server.js - VERSÃO FINAL COM PAYLOAD

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const axios = require('axios');
const cors = require('cors');
const Jimp = require('jimp');
const dialogue = require('./dialogue');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);

const PUSHPAY_API_KEY = "sua_chave_secreta_da_api_do_pushpay_aqui";
const BASE_URL = 'https://whatsapp-backend-vott.onrender.com';

const allowedOrigins = [
  'https://whastapp-thaisinha.netlify.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Acesso negado pelo CORS'));
    }
  }
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'media')));

app.get('/generate-image-with-city', async (req, res) => {
  try {
    const city = req.query.cidade || 'Sua Cidade';
    const imagePath = path.join(__dirname, 'media', 'generated-image-1.png');
    const fontPath = path.join(__dirname, 'media', 'fonts', 'open-sans-64-black.fnt');
    const [font, image] = await Promise.all([Jimp.loadFont(fontPath), Jimp.read(imagePath)]);
    image.print(font, 198, 125, { text: `${city}`, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, image.bitmap.width, image.bitmap.height);
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', Jimp.MIME_PNG);
    res.send(buffer);
  } catch (error) {
    console.error("ERRO AO GERAR IMAGEM:", error);
    res.status(500).send("Erro interno ao gerar imagem: " + error.message);
  }
});

app.post('/create-payment', async (req, res) => {
  if (PUSHPAY_API_KEY === "sua_chave_secreta_da_api_do_pushpay_aqui") {
    return res.status(400).json({ error: "A chave da API não foi configurada no servidor." });
  }
  try {
    const paymentData = { value: 1999, description: "Acesso ao Grupo VIP" };
    const response = await axios.post('https://api.pushinpay.com.br/v1/pix/charges', paymentData, {
      headers: { 'Authorization': `Bearer ${PUSHPAY_API_KEY}`, 'Content-Type': 'application/json' }
    });
    const pixData = { qrCode: response.data.qr_code_base64, copiaECola: response.data.copia_e_cola };
    res.json(pixData);
  } catch (error) {
    console.error("ERRO AO CRIAR PAGAMENTO:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Não foi possível gerar o pagamento." });
  }
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const userSessions = {};

async function getGeolocation(ip) {
  const apis = [
    { name: 'ipwhois.app', url: `https://ipwhois.app/json/${ip}`, getCity: (data) => data.success ? data.city : null },
    { name: 'ip-api.com', url: `http://ip-api.com/json/${ip}?fields=status,message,city`, getCity: (data) => data.status === 'success' ? data.city : null },
    { name: 'ipapi.co', url: `https://ipapi.co/${ip}/json/`, getCity: (data) => data.city }
  ];
  for (let api of apis) {
    try {
      const response = await axios.get(api.url);
      const city = api.getCity(response.data);
      if (city) { return city; }
    } catch (error) {}
  }
  return null;
}

async function sendBotMessages(socket, stepKey) {
  const userState = userSessions[socket.id];
  if (!userState) return;
  const step = dialogue[stepKey];
  if (!step) return;

  if (step.action && step.action.type === 'redirect') {
    socket.emit('redirectToURL', { url: step.action.url });
    return;
  }

  socket.emit('setUI', { inputEnabled: false, buttons: [] });
  for (const message of step.messages) {
    const status = message.type === 'audio' ? 'gravando áudio...' : 'digitando...';
    socket.emit('botStatus', { status });
    await new Promise(resolve => setTimeout(resolve, message.delay || 1000));
    let messageToSend = { ...message };
    if (messageToSend.type === 'text' && messageToSend.content.includes('{{city}}')) {
      messageToSend.content = messageToSend.content.replace('{{city}}', userState.city);
    } else if (messageToSend.type === 'image_with_location') {
      const city = encodeURIComponent(userState.city);
      messageToSend.type = 'image';
      messageToSend.content = `${BASE_URL}/generate-image-with-city?cidade=${city}`;
    }
    socket.emit('botMessage', messageToSend);
    socket.emit('botStatus', { status: 'online' });
  }
  if (step.response) {
    if (step.response.type === 'text') {
      socket.emit('setUI', { inputEnabled: true, buttons: [] });
    } else if (step.response.type === 'buttons') {
      socket.emit('setUI', { inputEnabled: false, buttons: step.response.options });
    } else if (step.response.type === 'continue') {
      userState.conversationStep = step.response.next;
      sendBotMessages(socket, userState.conversationStep);
    }
  }
}

io.on('connection', async (socket) => {
  console.log(`✅ Usuário conectado: ${socket.id}`);
  const userState = { city: 'São Paulo', conversationStep: 'START' };
  const userIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const finalIp = userIp.split(',')[0].trim();
  const detectedCity = await getGeolocation(finalIp);
  if (detectedCity) {
    userState.city = detectedCity;
  }
  userSessions[socket.id] = userState;
  sendBotMessages(socket, userState.conversationStep);

  socket.on('userMessage', (data) => {
    const userState = userSessions[socket.id];
    if (!userState) return;

    const currentStep = dialogue[userState.conversationStep];
    if (!currentStep || !currentStep.response) return;

    let nextStepKey;
    if (currentStep.response.type === 'buttons') {
      const option = currentStep.response.options.find(o => o.payload === data.payload);
      if (option) {
        nextStepKey = option.next;
      }
    } else if (currentStep.response.type === 'text') {
      nextStepKey = currentStep.response.next;
    }

    if (nextStepKey) {
      userState.conversationStep = nextStepKey;
      console.log(`🧠 Bot avançou para: ${nextStepKey} via payload: ${data.payload}`);
      sendBotMessages(socket, nextStepKey);
    } else {
      console.log(`❌ Payload não encontrado. Recebido:`, data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Usuário desconectado: ${socket.id}`);
    delete userSessions[socket.id];
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor BACKEND rodando na porta ${PORT}`);
});

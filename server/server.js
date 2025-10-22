// server.js - VERSÃO FINAL COM O ALINHAMENTO VERTICAL CORRIGIDO

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
const BASE_URL = 'https://whatsapp-backend-uql2.onrender.com';

const allowedOrigins = [
  'https://whastapps.netlify.app',
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


// ==================================================================
//    >>> A CORREÇÃO ESTÁ AQUI <<<
//    Removi a linha "alignmentY" que estava causando o bug.
// ==================================================================
app.get('/generate-image-with-city', async (req, res) => {
  try {
    const city = req.query.cidade || 'Sua Cidade';
    const imagePath = path.join(__dirname, 'media', 'generated-image-1.png');
    const fontPath = path.join(__dirname, 'media', 'fonts', 'open-sans-64-black.fnt');
    
    const [font, image] = await Promise.all([
      Jimp.loadFont(fontPath),
      Jimp.read(imagePath)
    ]);

    const textToPrint = ${city};
    
    // Posição X (horizontal) e Y (vertical)
    const finalX = 0;   // Começa no canto esquerdo
    const finalY = 130; // Posição vertical que agora VAI funcionar

    image.print(
      font, 
      finalX, 
      finalY, 
      {
        text: textToPrint,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER // Centraliza na horizontal
        // A linha "alignmentY" foi REMOVIDA
      },
      image.bitmap.width,
      image.bitmap.height
    );
    
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    res.set('Content-Type', Jimp.MIME_PNG);
    res.send(buffer);
  } catch (error) {
    console.error("ERRO CRÍTICO AO GERAR IMAGEM:", error);
    res.status(500).send("Erro ao gerar imagem: " + error.message);
  }
});


app.post('/create-payment', async (req, res) => {
    // ... (código de pagamento continua o mesmo) ...
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// ... (todo o resto do seu server.js com a geolocalização e as outras funções) ...
// Nenhuma outra parte precisa mudar.

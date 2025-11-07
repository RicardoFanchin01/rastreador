// server.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const Joi = require('joi');
const cors = require('cors');  // ✅ Import CORS
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Segurança e logs
app.use(helmet());
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ✅ Configuração CORS
app.use(cors({
  origin: ['https://gps-w7s3.onrender.com'], // frontend autorizado
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Opcional: permitir pré-flight (necessário para POST/PUT)
app.options('*', cors());

// validação com Joi
const locationSchema = Joi.object({
  deviceId: Joi.string().optional().allow(null, ''),
  latitude: Joi.number().required().min(-90).max(90),
  longitude: Joi.number().required().min(-180).max(180),
  recordedAt: Joi.date().iso().optional() // opcional; se enviado, será usado
});

// healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

// endpoint para receber uma leitura
app.post('/locations', async (req, res) => {
  const { error, value } = locationSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const deviceId = value.deviceId || null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const recordedAt = value.recordedAt ? new Date(value.recordedAt) : new Date();

  const insertQuery = `
    INSERT INTO locations (device_id, latitude, longitude, recorded_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, device_id, latitude, longitude, recorded_at, created_at
  `;

  try {
    const { rows } = await db.query(insertQuery, [deviceId, latitude, longitude, recordedAt]);
    return res.status(201).json({ ok: true, location: rows[0] });
  } catch (err) {
    console.error('DB error:', err);
    return res.status(500).json({ error: 'Failed to save location' });
  }
});

// opcional: endpoint simples para buscar últimas leituras por device
app.get('/locations/:deviceId/recent', async (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit, 10) || 20;

  try {
    const { rows } = await db.query(
      `SELECT id, device_id, latitude, longitude, recorded_at, created_at
       FROM locations
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [deviceId, limit]
    );
    res.json({ ok: true, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

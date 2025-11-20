// ------------------------------
// Census API - Final Server File
// ------------------------------

import dotenv from 'dotenv';
import express from 'express';
import mysql from 'mysql2/promise';

// Load environment variables from .env
dotenv.config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
});

// Create Express app
const app = express();
app.use(express.json());


// Basic Authentication Middleware 
async function basicAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header. Basic Auth required.' });
    }

    const base64Credentials = authHeader.split(' ')[1];
    const decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid Basic Auth credentials format' });
    }

    // Check the admins table
    const [rows] = await pool.query(
      'SELECT * FROM admins WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Optionally attach admin to request
    req.admin = { id: rows[0].id, username: rows[0].username };
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed due to server error' });
  }
}


// Protect all routes with Basic Auth
app.use(basicAuth);

// Validation Helper
function validateParticipantBody(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Body must be a JSON object'] };
  }

  const { participant, work, home } = body;

  if (!participant) errors.push('Missing "participant" object');
  if (!work) errors.push('Missing "work" object');
  if (!home) errors.push('Missing "home" object');

  if (errors.length) return { valid: false, errors };

  const { email, firstname, lastname, dob } = participant;
  const { companyname, salary, currency } = work;
  const { country, city } = home;

  if (!email) errors.push('participant.email is required');
  if (!firstname) errors.push('participant.firstname is required');
  if (!lastname) errors.push('participant.lastname is required');
  if (!dob) errors.push('participant.dob is required');

  if (!companyname) errors.push('work.companyname is required');
  if (salary === undefined || salary === null) errors.push('work.salary is required');
  if (!currency) errors.push('work.currency is required');

  if (!country) errors.push('home.country is required');
  if (!city) errors.push('home.city is required');

  // Email format
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('participant.email must be a valid email address');
    }
  }

  // DOB format YYYY-MM-DD
  if (dob) {
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(dob)) {
      errors.push('participant.dob must be in format YYYY-MM-DD');
    } else {
      const date = new Date(dob);
      if (Number.isNaN(date.getTime())) {
        errors.push('participant.dob is not a valid date');
      }
    }
  }

  // salary is number
  if (salary !== undefined && salary !== null && isNaN(Number(salary))) {
    errors.push('work.salary must be a number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}


// DB Test Route

app.get('/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ db: 'connected', result: rows[0] });
  } catch (err) {
    console.error('DB test error:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});


// Root Test Route
app.get('/', (req, res) => {
  res.json({ message: 'Census API is running and protected with Basic Auth' });
});


// PARTICIPANT API ROUTES

// POST /participants/add
app.post('/participants/add', async (req, res) => {
  const { valid, errors } = validateParticipantBody(req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { participant, work, home } = req.body;
  const { email, firstname, lastname, dob } = participant;
  const { companyname, salary, currency } = work;
  const { country, city } = home;

  try {
    await pool.query(
      `INSERT INTO participants
       (email, firstname, lastname, dob, companyname, salary, currency, country, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, firstname, lastname, dob, companyname, salary, currency, country, city]
    );

    res.status(201).json({
      message: 'Participant added successfully',
      participant: { email, firstname, lastname, dob, companyname, salary, currency, country, city }
    });
  } catch (err) {
    console.error('Add participant error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: `Participant with email ${email} already exists` });
    }
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// GET /participants - all data
app.get('/participants', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM participants');
    res.json({ participants: rows });
  } catch (err) {
    console.error('Get participants error:', err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// GET /participants/details - all participants personal details
app.get('/participants/details', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT firstname, lastname, email FROM participants'
    );
    res.json({ participants: rows });
  } catch (err) {
    console.error('Get participant details error:', err);
    res.status(500).json({ error: 'Failed to fetch participant details' });
  }
});

// GET /participants/details/:email - specific participant personal details
app.get('/participants/details/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT firstname, lastname, dob FROM participants WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Participant with email ${email} not found` });
    }

    res.json({ participant: rows[0] });
  } catch (err) {
    console.error('Get participant details by email error:', err);
    res.status(500).json({ error: 'Failed to fetch participant details' });
  }
});

// GET /participants/work/:email - specific participant work details
app.get('/participants/work/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT companyname AS companyName, salary, currency FROM participants WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Participant with email ${email} not found` });
    }

    res.json({ work: rows[0] });
  } catch (err) {
    console.error('Get work details error:', err);
    res.status(500).json({ error: 'Failed to fetch participant work details' });
  }
});

// GET /participants/home/:email - specific participant home details
app.get('/participants/home/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT country, city FROM participants WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Participant with email ${email} not found` });
    }

    res.json({ home: rows[0] });
  } catch (err) {
    console.error('Get home details error:', err);
    res.status(500).json({ error: 'Failed to fetch participant home details' });
  }
});

// DELETE /participants/:email
app.delete('/participants/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const [result] = await pool.query(
      'DELETE FROM participants WHERE email = ?',
      [email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Participant with email ${email} not found` });
    }

    res.json({ message: `Participant with email ${email} deleted successfully` });
  } catch (err) {
    console.error('Delete participant error:', err);
    res.status(500).json({ error: 'Failed to delete participant' });
  }
});

// PUT /participants/:email - full update
app.put('/participants/:email', async (req, res) => {
  const emailParam = req.params.email;

  const { valid, errors } = validateParticipantBody(req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { participant, work, home } = req.body;
  const { email, firstname, lastname, dob } = participant;
  const { companyname, salary, currency } = work;
  const { country, city } = home;

  // Ensure URL email and body email match
  if (email !== emailParam) {
    return res.status(400).json({
      error: 'Email in URL and body must match'
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE participants
       SET firstname = ?, lastname = ?, dob = ?, companyname = ?, salary = ?, currency = ?, country = ?, city = ?
       WHERE email = ?`,
      [firstname, lastname, dob, companyname, salary, currency, country, city, emailParam]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Participant with email ${emailParam} not found` });
    }

    res.json({
      message: `Participant with email ${emailParam} updated successfully`,
      participant: { email, firstname, lastname, dob, companyname, salary, currency, country, city }
    });
  } catch (err) {
    console.error('Update participant error:', err);
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

// ============================
// Start Server
// ============================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Census API running on port ${port}`);
});

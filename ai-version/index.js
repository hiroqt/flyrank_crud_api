const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.AI_PORT || 4000;

app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[AI Version] Missing SUPABASE_URL or SUPABASE_KEY in environment');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  // Naive token extraction: only checks if header exists and splits by space
  if (!authHeader) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const parts = authHeader.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0]; // accepts raw token without 'Bearer'

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// 1. POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(201).json(data.user);
});

// 2. POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return res.status(401).json({ error: 'Invalid login credentials' });
  }
  return res.status(200).json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

// 3. POST /auth/logout
app.post('/auth/logout', authenticateToken, async (req, res) => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(204).send();
});

// 4. GET /public/info
app.get('/public/info', (req, res) => {
  res.status(200).json({ message: 'Welcome stranger! This info is public.' });
});

// 5. GET /protected/profile
app.get('/protected/profile', authenticateToken, (req, res) => {
  res.status(200).json({
    id: req.user.id,
    email: req.user.email,
    created_at: req.user.created_at,
  });
});

// Swagger Specification
const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Secured Auth API (AI Version)',
    version: '1.0.0',
    description: 'AI-generated Supabase Auth implementation',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/public/info': {
      get: {
        summary: 'Public Info',
        responses: { 200: { description: 'Public message' } },
      },
    },
    '/auth/signup': {
      post: {
        summary: 'User Signup',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'test@example.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'User created' }, 400: { description: 'Bad Request' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'User Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'test@example.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'JWT tokens' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'User Logout',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'No content' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/protected/profile': {
      get: {
        summary: 'User Profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User profile' }, 401: { description: 'Unauthorized' } },
      },
    },
  },
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(PORT, () => {
  console.log(`[AI Version] Server listening on port ${PORT}`);
});

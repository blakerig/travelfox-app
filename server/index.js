require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/api/cities', async (req, res) => {
  const cities = await prisma.city.findMany();
  res.json(cities);
});

app.get('/api/cities/:cityId/places', async (req, res) => {
  const cityId = Number(req.params.cityId);
  const places = await prisma.place.findMany({
    where: { cityId },
    include: { category: true },
  });
  res.json(places);
});

app.get('/api/categories', async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
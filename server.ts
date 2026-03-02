import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        income DECIMAL(12, 2) NOT NULL,
        currency TEXT DEFAULT 'USD'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        category TEXT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        expense_date DATE DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        month TEXT NOT NULL,
        total DECIMAL(12, 2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        target_amount DECIMAL(12, 2) NOT NULL,
        current_amount DECIMAL(12, 2) DEFAULT 0,
        deadline DATE
      );

      CREATE TABLE IF NOT EXISTS financial_docs (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `);

    // Seed data if empty
    const userCount = await client.query("SELECT COUNT(*) FROM users");
    if (parseInt(userCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO users (name, income, currency) VALUES
        ('Sarah Johnson', 5000, 'USD'),
        ('Elena Rodriguez', 4200, 'USD'),
        ('Amina Okafor', 6500, 'USD'),
        ('Mei Chen', 5500, 'USD');

        INSERT INTO financial_docs (title, content) VALUES
        ('The 50/30/20 Rule', 'Allocate 50% of income to needs, 30% to wants, and 20% to savings and debt repayment.'),
        ('Zero-Based Budgeting', 'Every dollar of your income is assigned a specific purpose, so your income minus expenses equals zero at the end of the month.'),
        ('Emergency Fund Basics', 'Aim to save 3-6 months of essential living expenses in a high-yield savings account.'),
        ('Investing for Women', 'Women often live longer and face a gender pay gap, making early and consistent investing even more critical for long-term security.');

        INSERT INTO budgets (user_id, month, total) VALUES
        (1, '2024-03', 4500),
        (2, '2024-03', 3800),
        (3, '2024-03', 5500),
        (4, '2024-03', 4800);

        INSERT INTO expenses (user_id, category, amount, expense_date) VALUES
        (1, 'Rent', 1500, '2024-03-01'),
        (1, 'Groceries', 400, '2024-03-05'),
        (1, 'Healthcare', 200, '2024-03-10'),
        (1, 'Transport', 150, '2024-03-12'),
        (1, 'Education', 300, '2024-03-15'),
        (1, 'Savings', 1000, '2024-03-20');

        INSERT INTO goals (user_id, title, target_amount, current_amount, deadline) VALUES
        (1, 'Emergency Fund', 10000, 2500, '2024-12-31'),
        (1, 'New Laptop', 2000, 800, '2024-06-30'),
        (1, 'Summer Vacation', 5000, 1200, '2024-07-15');
      `);
    }
  } finally {
    client.release();
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  if (process.env.DATABASE_URL) {
    try {
      await initDb();
      console.log("Database initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize database:", err.message);
    }
  } else {
    console.warn("DATABASE_URL is missing. Database features will not work.");
  }

  app.get("/api/get_user_financials", async (req, res) => {
    const userId = req.query.userId || 1;
    try {
      const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      const expensesRes = await pool.query("SELECT * FROM expenses WHERE user_id = $1 ORDER BY expense_date DESC", [userId]);
      const budgetRes = await pool.query("SELECT * FROM budgets WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId]);
      const goalsRes = await pool.query("SELECT * FROM goals WHERE user_id = $1", [userId]);
      
      res.json({
        user: userRes.rows[0],
        expenses: expensesRes.rows,
        budget: budgetRes.rows[0],
        goals: goalsRes.rows
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/add_goal", async (req, res) => {
    const { userId, title, targetAmount, deadline } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO goals (user_id, title, target_amount, deadline) VALUES ($1, $2, $3, $4) RETURNING *",
        [userId || 1, title, targetAmount, deadline]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/update_goal_progress", async (req, res) => {
    const { goalId, amount } = req.body;
    try {
      const result = await pool.query(
        "UPDATE goals SET current_amount = current_amount + $1 WHERE id = $2 RETURNING *",
        [amount, goalId]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/get_financial_docs", async (req, res) => {
    try {
      const docsRes = await pool.query("SELECT * FROM financial_docs");
      res.json(docsRes.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/save_budget", async (req, res) => {
    const { userId, month, total } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO budgets (user_id, month, total) VALUES ($1, $2, $3) RETURNING *",
        [userId || 1, month, total]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/update_user", async (req, res) => {
    const { userId, name, income } = req.body;
    try {
      const result = await pool.query(
        "UPDATE users SET name = $1, income = $2 WHERE id = $3 RETURNING *",
        [name, income, userId || 1]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/add_expense", async (req, res) => {
    const { userId, category, amount, date } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO expenses (user_id, category, amount, expense_date) VALUES ($1, $2, $3, $4) RETURNING *",
        [userId || 1, category, amount, date || new Date()]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/get_budget_summary", async (req, res) => {
    const userId = req.query.userId || 1;
    try {
      const budgetRes = await pool.query("SELECT total FROM budgets WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId]);
      const expensesRes = await pool.query("SELECT SUM(amount) as total_spent FROM expenses WHERE user_id = $1", [userId]);
      
      const budget = budgetRes.rows[0]?.total || 0;
      const spent = expensesRes.rows[0]?.total_spent || 0;
      
      res.json({
        budget,
        spent,
        remaining: budget - spent
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

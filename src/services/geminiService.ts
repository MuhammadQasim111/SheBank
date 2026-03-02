import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const getFinancialsTool: FunctionDeclaration = {
  name: "getUserFinancials",
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.NUMBER, description: "The ID of the user to fetch data for." }
    },
    required: ["userId"]
  },
  description: "Fetches user income, expenses, and current budget."
};

const getDocsTool: FunctionDeclaration = {
  name: "getFinancialDocs",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
  description: "Fetches financial guidance documents and rules (e.g., 50/30/20 rule)."
};

const addExpenseTool: FunctionDeclaration = {
  name: "addExpense",
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.NUMBER },
      category: { type: Type.STRING },
      amount: { type: Type.NUMBER },
      date: { type: Type.STRING, description: "ISO date string" }
    },
    required: ["userId", "category", "amount"]
  },
  description: "Adds a new expense entry for the user."
};

const saveBudgetTool: FunctionDeclaration = {
  name: "saveBudget",
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.NUMBER },
      month: { type: Type.STRING, description: "YYYY-MM format" },
      total: { type: Type.NUMBER }
    },
    required: ["userId", "month", "total"]
  },
  description: "Saves a new budget for the user."
};

const addGoalTool: FunctionDeclaration = {
  name: "addGoal",
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.NUMBER },
      title: { type: Type.STRING },
      targetAmount: { type: Type.NUMBER },
      deadline: { type: Type.STRING, description: "ISO date string" }
    },
    required: ["userId", "title", "targetAmount"]
  },
  description: "Adds a new financial goal for the user."
};

const updateGoalProgressTool: FunctionDeclaration = {
  name: "updateGoalProgress",
  parameters: {
    type: Type.OBJECT,
    properties: {
      goalId: { type: Type.NUMBER },
      amount: { type: Type.NUMBER, description: "Amount to add to current progress" }
    },
    required: ["goalId", "amount"]
  },
  description: "Updates the progress of a financial goal."
};

export const tools = [
  {
    functionDeclarations: [
      getFinancialsTool,
      getDocsTool,
      addExpenseTool,
      saveBudgetTool,
      addGoalTool,
      updateGoalProgressTool
    ]
  }
];

export const systemInstruction = `You are SheCounts Assistant, a financial empowerment expert for women.
Your goal is to provide personalized, empowering, and educational financial guidance.

Guidelines:
1. Use real data from the tools provided. Never hallucinate financial values.
2. Apply budgeting frameworks like the 50/30/20 rule or zero-based budgeting.
3. Break down advice into Needs, Wants, and Savings/Debt.
4. Be concise, encouraging, and actionable.
5. Do not provide professional financial advice; include a disclaimer if necessary.
6. When a user adds an expense, analyze their budget and provide immediate feedback.
7. Suggest specific savings strategies based on their spending patterns.

Tone: Professional, warm, and empowering.`;

export async function handleToolCall(call: { name: string; args: any }) {
  const { name, args } = call;
  switch (name) {
    case "getUserFinancials": {
      const res = await fetch(`/api/get_user_financials?userId=${args.userId || 1}`);
      return await res.json();
    }
    case "getFinancialDocs": {
      const res = await fetch("/api/get_financial_docs");
      return await res.json();
    }
    case "addExpense": {
      const res = await fetch("/api/add_expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
    case "saveBudget": {
      const res = await fetch("/api/save_budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
    case "addGoal": {
      const res = await fetch("/api/add_goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
    case "updateGoalProgress": {
      const res = await fetch("/api/update_goal_progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      return await res.json();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Plus, 
  Sparkles,
  MessageSquare, 
  Bell, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight,
  ChevronRight,
  BookOpen,
  Target,
  Send,
  Loader2,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { tools, systemInstruction, handleToolCall } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface User {
  id: number;
  name: string;
  income: number;
  currency: string;
}

interface Expense {
  id: number;
  category: string;
  amount: number;
  expense_date: string;
}

interface Budget {
  id: number;
  total: number;
  month: string;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface Goal {
  id: number;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hi! I'm your SheCounts assistant. How can I help you with your finances today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [newExpense, setNewExpense] = useState({
    category: 'Groceries',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [newGoal, setNewGoal] = useState({
    title: '',
    targetAmount: '',
    deadline: ''
  });

  const [newBudget, setNewBudget] = useState({
    month: new Date().toISOString().slice(0, 7),
    total: ''
  });

  const [newProfile, setNewProfile] = useState({
    name: '',
    income: ''
  });

  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [budgetSuggestion, setBudgetSuggestion] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/get_user_financials');
      const data = await res.json();
      setUser(data.user);
      setExpenses(data.expenses);
      setBudget(data.budget);
      setGoals(data.goals || []);

      const docsRes = await fetch('/api/get_financial_docs');
      const docsData = await docsRes.json();
      setDocs(docsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (user && expenses.length > 0 && !aiRecommendation && !isGeneratingAi) {
      generateAiRecommendation();
    }
  }, [user, expenses, budget]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(newExpense.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number");
      return;
    }

    if (!newExpense.category || newExpense.category.trim() === "") {
      setError("Please select or enter a category");
      return;
    }

    try {
      const res = await fetch('/api/add_expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 1,
          category: newExpense.category,
          amount: amount,
          date: newExpense.date
        })
      });
      if (res.ok) {
        setShowExpenseForm(false);
        setNewExpense({ category: 'Groceries', amount: '', date: new Date().toISOString().split('T')[0] });
        await fetchData();
        generateAiRecommendation();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add expense");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(newGoal.targetAmount);
    if (isNaN(amount)) {
      setError("Please enter a valid target amount");
      return;
    }
    try {
      const res = await fetch('/api/add_goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 1,
          title: newGoal.title,
          targetAmount: amount,
          deadline: newGoal.deadline
        })
      });
      if (res.ok) {
        setShowGoalForm(false);
        setNewGoal({ title: '', targetAmount: '', deadline: '' });
        await fetchData();
        generateAiRecommendation();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add goal");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const generateAiRecommendation = async () => {
    if (!user) return;
    setIsGeneratingAi(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const financialData = {
        income: user.income,
        budget: budget?.total || 0,
        totalSpent: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
        expenses: expenses.map(e => ({ category: e.category, amount: e.amount, date: e.expense_date })),
        goals: goals.map(g => ({ title: g.title, target: g.target_amount, current: g.current_amount, deadline: g.deadline }))
      };

      const prompt = `Analyze my financial situation and provide 3-4 actionable recommendations to balance my monthly budget. 
      Current Data: ${JSON.stringify(financialData)}
      
      Focus on:
      1. Spending patterns (identify overspending).
      2. Savings opportunities.
      3. Progress towards goals.
      4. Balancing the 50/30/20 rule if applicable.
      
      Keep it concise, empowering, and formatted in Markdown.`;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction
        }
      });

      setAiRecommendation(response.text || "Unable to generate recommendations at this time.");
    } catch (err) {
      console.error("AI Generation Error:", err);
      setError("Failed to generate AI recommendations.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleUpdateGoalProgress = async (goalId: number, amount: number) => {
    try {
      const res = await fetch('/api/update_goal_progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, amount })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateBudgetSuggestion = async () => {
    if (!user?.income) {
      setError("Please set your income in the profile first to get a suggestion.");
      return;
    }
    setIsGeneratingSuggestion(true);
    setBudgetSuggestion(null);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setError("Gemini API key is missing.");
        setIsGeneratingSuggestion(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { 
            role: 'user', 
            parts: [{ 
              text: `My monthly income is $${user.income}. Based on the 50/30/20 rule, suggest a budget allocation. 
              Provide a breakdown for Needs (50%), Wants (30%), and Savings/Debt (20%). 
              Also, give a brief piece of advice on how to stick to this budget.
              Format the response clearly with bullet points and bold text for the amounts.` 
            }] 
          }
        ]
      });
      setBudgetSuggestion(response.text);
    } catch (err) {
      console.error(err);
      setError("Failed to generate suggestion.");
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const total = parseFloat(newBudget.total);
    if (isNaN(total)) {
      setError("Please enter a valid budget total");
      return;
    }
    try {
      const res = await fetch('/api/save_budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 1,
          month: newBudget.month,
          total: total
        })
      });
      if (res.ok) {
        setShowBudgetForm(false);
        setNewBudget({ month: new Date().toISOString().slice(0, 7), total: '' });
        await fetchData();
        generateAiRecommendation();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save budget");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const income = parseFloat(newProfile.income);
    if (isNaN(income)) {
      setError("Please enter a valid income");
      return;
    }
    try {
      const res = await fetch('/api/update_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || 1,
          name: newProfile.name,
          income: income
        })
      });
      if (res.ok) {
        setShowProfileForm(false);
        await fetchData();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update profile");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setMessages(prev => [...prev, { role: 'model', text: "Gemini API key is missing. Please configure it in the Secrets panel." }]);
        setIsTyping(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction,
          tools
        }
      });

      let finalResponse = response.text;
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        const toolResults = await Promise.all(
          functionCalls.map(async (call) => {
            if (!call.name) return null;
            return {
              functionResponse: {
                name: call.name,
                response: await handleToolCall({ name: call.name, args: call.args })
              }
            };
          })
        );

        const filteredResults = toolResults.filter(r => r !== null);

        const secondResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { role: 'user', parts: [{ text: userMsg }] },
            { role: 'model', parts: response.candidates[0].content.parts },
            { role: 'user', parts: filteredResults as any }
          ],
          config: { systemInstruction }
        });
        finalResponse = secondResponse.text;
      }

      setMessages(prev => [...prev, { role: 'model', text: finalResponse || "I'm sorry, I couldn't process that." }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: "Error connecting to AI assistant." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = docs.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    doc.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const budgetLimit = budget?.total || 0;
  const isOverspent = totalSpent > budgetLimit;
  const remaining = budgetLimit - totalSpent;
  const categories = Array.from(new Set(expenses.map(e => e.category)));
  const chartData = categories.map(cat => ({
    name: cat,
    value: expenses.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount), 0)
  }));

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FDFCFB]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 hidden lg:flex flex-col items-center py-8 bg-white border-r border-slate-100 z-50">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white mb-12">
          <TrendingUp className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-8">
          <button className="p-3 text-indigo-600 bg-indigo-50 rounded-xl"><Wallet className="w-6 h-6" /></button>
          <button className="p-3 text-slate-400 hover:text-indigo-600 transition-colors"><PieChartIcon className="w-6 h-6" /></button>
          <button className="p-3 text-slate-400 hover:text-indigo-600 transition-colors"><BookOpen className="w-6 h-6" /></button>
          <button className="p-3 text-slate-400 hover:text-indigo-600 transition-colors"><Bell className="w-6 h-6" /></button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:pl-20 max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 font-serif">Welcome back, {user?.name.split(' ')[0]}</h1>
            <p className="text-slate-500">Your financial health at a glance.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search guidance..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none w-64"
              />
            </div>
            <button 
              onClick={() => {
                setNewProfile({ name: user?.name || '', income: user?.income.toString() || '' });
                setShowProfileForm(true);
              }}
              className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-100 px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-50 transition-all"
            >
              Update Profile
            </button>
            <button 
              onClick={() => {
                setBudgetSuggestion(null);
                setShowBudgetForm(true);
              }}
              className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-100 px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-50 transition-all"
            >
              <PieChartIcon className="w-5 h-5" />
              Set Budget
            </button>
            <button 
              onClick={() => setShowGoalForm(true)}
              className="flex items-center gap-2 bg-white text-indigo-600 border border-indigo-100 px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-50 transition-all"
            >
              <Target className="w-5 h-5" />
              Add Goal
            </button>
            <button 
              onClick={() => setShowExpenseForm(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="w-5 h-5" />
              Add Expense
            </button>
          </div>
        </header>

        {/* Alerts */}
        {isOverspent && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4 text-rose-700"
          >
            <div className="p-2 bg-rose-100 rounded-lg"><Bell className="w-5 h-5" /></div>
            <div>
              <p className="font-bold">Overspending Alert</p>
              <p className="text-sm">You've exceeded your monthly budget by ${ (totalSpent - budgetLimit).toLocaleString() }. Consider reviewing your "Wants" category.</p>
            </div>
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Wallet className="w-5 h-5" /></div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Income</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Monthly Income</p>
            <h3 className="text-2xl font-bold text-slate-900">${user?.income.toLocaleString()}</h3>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Target className="w-5 h-5" /></div>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">Budget</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Monthly Budget</p>
            <h3 className="text-2xl font-bold text-slate-900">${budget?.total.toLocaleString()}</h3>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><ArrowUpRight className="w-5 h-5" /></div>
              <span className={cn(
                "text-xs font-semibold px-2 py-1 rounded-full",
                isOverspent ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50"
              )}>
                {Math.round((totalSpent / (budget?.total || 1)) * 100)}%
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Total Expenses</p>
            <h3 className="text-2xl font-bold text-slate-900">${totalSpent.toLocaleString()}</h3>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><ArrowDownRight className="w-5 h-5" /></div>
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Available</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Remaining Balance</p>
            <h3 className="text-2xl font-bold text-slate-900">${remaining.toLocaleString()}</h3>
          </motion.div>
        </div>

        {/* AI Insights Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 glass-card p-6 border-l-4 border-indigo-500"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 font-serif">AI Financial Insights</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Live Analysis</span>
                </div>
              </div>
            </div>
            <button 
              onClick={generateAiRecommendation}
              disabled={isGeneratingAi}
              className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              {isGeneratingAi ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  Refresh Insights
                </>
              )}
            </button>
          </div>
          
          <div className="markdown-body">
            {aiRecommendation ? (
              <div className="text-slate-700 leading-relaxed">
                <ReactMarkdown>{aiRecommendation}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-slate-500 mb-4 text-sm">Get personalized AI recommendations based on your spending and goals.</p>
                <button 
                  onClick={generateAiRecommendation}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all"
                >
                  Generate My Insights
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Charts and Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Expense Breakdown */}
          <div className="lg:col-span-2 glass-card p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-6 font-serif">Expense Breakdown</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900 font-serif">Recent</h3>
              <button className="text-indigo-600 text-sm font-medium hover:underline">View all</button>
            </div>
            <div className="space-y-4">
              {expenses.length > 0 ? expenses.slice(0, 5).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                      {expense.category[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{expense.category}</p>
                      <p className="text-xs text-slate-500">{new Date(expense.expense_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-rose-600">-${Number(expense.amount).toLocaleString()}</p>
                </div>
              )) : (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No expenses yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Savings Goals */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Savings Goals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.length > 0 ? goals.map((goal) => {
              const progress = (Number(goal.current_amount) / Number(goal.target_amount)) * 100;
              return (
                <motion.div 
                  key={goal.id} 
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card p-6 flex flex-col"
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">{goal.title}</span>
                    <span className="text-sm font-bold text-indigo-600">{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="bg-indigo-600 h-full rounded-full" 
                    />
                  </div>
                  <div className="flex justify-between items-end mt-auto">
                    <div>
                      <span className="block text-xs text-slate-500 font-medium">${Number(goal.current_amount).toLocaleString()} saved</span>
                      <span className="block text-[10px] text-slate-400">Target: ${Number(goal.target_amount).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleUpdateGoalProgress(goal.id, 100)}
                        className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                        title="Add $100"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            }) : (
              <div className="col-span-full glass-card p-8 text-center">
                <p className="text-slate-400">No goals set yet. Start by adding one!</p>
              </div>
            )}
          </div>
        </div>

        {/* Financial Guidance */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Financial Empowerment</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredDocs.map((doc) => (
              <motion.div 
                key={doc.id} 
                whileHover={{ y: -5 }}
                className="glass-card p-6 cursor-pointer group"
              >
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 mb-2">{doc.title}</h4>
                <p className="text-sm text-slate-500 line-clamp-3">{doc.content}</p>
                <div className="mt-4 flex items-center text-indigo-600 text-sm font-semibold">
                  Read more <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      <button 
        onClick={() => setShowChat(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-300 hover:scale-110 transition-transform z-40"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat Sidebar */}
      <AnimatePresence>
        {showChat && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChat(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="p-6 border-bottom border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">SheCounts Assistant</h3>
                    <p className="text-xs text-indigo-100">AI Financial Empowerment</p>
                  </div>
                </div>
                <button onClick={() => setShowChat(false)} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm",
                      msg.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none" 
                        : "bg-slate-100 text-slate-800 rounded-tl-none"
                    )}>
                      <div className="markdown-body">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex items-start gap-2">
                    <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-slate-100">
                <div className="relative">
                  <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask about your budget, savings, or tips..."
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                  <button 
                    onClick={sendMessage}
                    disabled={!input.trim() || isTyping}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-3 text-center">
                  SheCounts Assistant provides educational guidance, not professional financial advice.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileForm && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Update Profile</h3>
              {error && <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl">{error}</div>}
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={newProfile.name}
                    onChange={(e) => setNewProfile({...newProfile, name: e.target.value})}
                    placeholder="Sarah Johnson"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Monthly Income ($)</label>
                  <input 
                    type="number" 
                    required
                    value={newProfile.income}
                    onChange={(e) => setNewProfile({...newProfile, income: e.target.value})}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowProfileForm(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Budget Modal */}
      <AnimatePresence>
        {showBudgetForm && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowBudgetForm(false);
                setBudgetSuggestion(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Set Monthly Budget</h3>
              {error && <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl">{error}</div>}
              <form onSubmit={handleSaveBudget} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Month</label>
                  <input 
                    type="month" 
                    required
                    value={newBudget.month}
                    onChange={(e) => setNewBudget({...newBudget, month: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-semibold text-slate-700">Total Budget ($)</label>
                    <button 
                      type="button"
                      onClick={generateBudgetSuggestion}
                      disabled={isGeneratingSuggestion}
                      className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {isGeneratingSuggestion ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Suggest with AI
                    </button>
                  </div>
                  <input 
                    type="number" 
                    required
                    value={newBudget.total}
                    onChange={(e) => setNewBudget({...newBudget, total: e.target.value})}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {budgetSuggestion && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">AI Suggestion (50/30/20)</span>
                    </div>
                    <div className="text-xs text-indigo-800 leading-relaxed whitespace-pre-wrap">
                      {budgetSuggestion}
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        // Extract the total (Needs + Wants) if possible, or just use the income * 0.8
                        const suggestedTotal = (user?.income || 0) * 0.8;
                        setNewBudget({ ...newBudget, total: suggestedTotal.toString() });
                      }}
                      className="mt-3 text-[10px] font-bold text-indigo-600 underline hover:text-indigo-700"
                    >
                      Apply suggested total (${((user?.income || 0) * 0.8).toLocaleString()})
                    </button>
                  </motion.div>
                )}
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowBudgetForm(false);
                      setBudgetSuggestion(null);
                    }}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Save Budget
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {showExpenseForm && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExpenseForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Add New Expense</h3>
              {error && <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl">{error}</div>}
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                  <select 
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {['Rent', 'Groceries', 'Healthcare', 'Utilities', 'Transport', 'Childcare', 'Education', 'Savings', 'Investments', 'Wants'].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Amount ($)</label>
                  <input 
                    type="number" 
                    required
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                  <input 
                    type="date" 
                    required
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowExpenseForm(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Save Expense
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Goal Modal */}
      <AnimatePresence>
        {showGoalForm && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGoalForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6 font-serif">Set New Goal</h3>
              {error && <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl">{error}</div>}
              <form onSubmit={handleAddGoal} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Goal Title</label>
                  <input 
                    type="text" 
                    required
                    value={newGoal.title}
                    onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                    placeholder="e.g., Emergency Fund"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Target Amount ($)</label>
                  <input 
                    type="number" 
                    required
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({...newGoal, targetAmount: e.target.value})}
                    placeholder="0.00"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Deadline (Optional)</label>
                  <input 
                    type="date" 
                    value={newGoal.deadline}
                    onChange={(e) => setNewGoal({...newGoal, deadline: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowGoalForm(false)}
                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    Save Goal
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

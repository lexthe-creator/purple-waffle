import React, { useMemo, useState } from 'react';
import { useProfileContext } from '../context/ProfileContext.jsx';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount ?? 0);
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceScreen() {
  const { profile, setProfile } = useProfileContext();
  const { transactions, recurringExpenses } = profile;

  // Add-transaction form state
  const [txOpen, setTxOpen] = useState(false);
  const [txName, setTxName] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState('expense');

  // Add-subscription form state
  const [subOpen, setSubOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');

  const budget = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    const monthTx = transactions.filter(tx => tx.date >= monthStart && tx.date < monthEnd);
    const income = monthTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
    const expenses = monthTx.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
    const subscriptionTotal = recurringExpenses.reduce((sum, r) => sum + (r.amount ?? 0), 0);

    return { income, expenses, subscriptionTotal, net: income - expenses };
  }, [transactions, recurringExpenses]);

  function addTransaction() {
    const name = txName.trim();
    const amount = Number.parseFloat(txAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    const newTx = { id: `tx-${Date.now()}`, name, amount, type: txType, date: getTodayDateKey() };
    setProfile(p => ({ ...p, transactions: [newTx, ...p.transactions] }));
    setTxName('');
    setTxAmount('');
    setTxType('expense');
    setTxOpen(false);
  }

  function addSubscription() {
    const name = subName.trim();
    const amount = Number.parseFloat(subAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    const newSub = { id: `sub-${Date.now()}`, name, amount };
    setProfile(p => ({ ...p, recurringExpenses: [newSub, ...p.recurringExpenses] }));
    setSubName('');
    setSubAmount('');
    setSubOpen(false);
  }

  function removeSubscription(id) {
    setProfile(p => ({ ...p, recurringExpenses: p.recurringExpenses.filter(r => r.id !== id) }));
  }

  return (
    <div className="screen-content">
      {/* Budget summary */}
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">This month</p>
            <h2>Budget overview</h2>
          </div>
        </div>
        <div className="metric-row">
          <div className="metric-block">
            <span className="metric-label">Income</span>
            <span className="metric-value" style={{ color: 'var(--success)' }}>{formatCurrency(budget.income)}</span>
          </div>
          <div className="metric-block">
            <span className="metric-label">Expenses</span>
            <span className="metric-value" style={{ color: 'var(--danger)' }}>{formatCurrency(budget.expenses)}</span>
          </div>
          <div className="metric-block">
            <span className="metric-label">Net</span>
            <span className="metric-value" style={{ color: budget.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(budget.net)}
            </span>
          </div>
        </div>
      </section>

      {/* Transactions */}
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Ledger</p>
            <h2>Transactions</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setTxOpen(o => !o)}>
            {txOpen ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {txOpen && (
          <div className="inline-collapse" style={{ marginBottom: '12px' }}>
            <input
              className="brain-dump-input"
              placeholder="Description"
              value={txName}
              onChange={e => setTxName(e.target.value)}
            />
            <input
              className="brain-dump-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (USD)"
              value={txAmount}
              onChange={e => setTxAmount(e.target.value)}
            />
            <div className="segmented-control" style={{ marginBottom: '8px' }}>
              {['expense', 'income'].map(t => (
                <button
                  key={t}
                  type="button"
                  className={`segment-button ${txType === t ? 'is-active' : ''}`}
                  onClick={() => setTxType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" className="primary-button full-width" onClick={addTransaction}>
              Save transaction
            </button>
          </div>
        )}

        {transactions.length === 0 ? (
          <p className="empty-hint">No transactions yet. Add your first one above.</p>
        ) : (
          <ul className="plain-list">
            {transactions.slice(0, 20).map(tx => (
              <li key={tx.id} className="list-row">
                <span className="list-row-label">{tx.name}</span>
                <span
                  className="list-row-meta"
                  style={{ color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)' }}
                >
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
                <span className="list-row-date">{tx.date}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Subscriptions */}
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Recurring</p>
            <h2>Subscriptions</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setSubOpen(o => !o)}>
            {subOpen ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {budget.subscriptionTotal > 0 && (
          <p className="eyebrow" style={{ marginBottom: '8px' }}>
            Total / month: {formatCurrency(budget.subscriptionTotal)}
          </p>
        )}

        {subOpen && (
          <div className="inline-collapse" style={{ marginBottom: '12px' }}>
            <input
              className="brain-dump-input"
              placeholder="Service name"
              value={subName}
              onChange={e => setSubName(e.target.value)}
            />
            <input
              className="brain-dump-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Monthly amount (USD)"
              value={subAmount}
              onChange={e => setSubAmount(e.target.value)}
            />
            <button type="button" className="primary-button full-width" onClick={addSubscription}>
              Save subscription
            </button>
          </div>
        )}

        {recurringExpenses.length === 0 ? (
          <p className="empty-hint">No subscriptions tracked yet.</p>
        ) : (
          <ul className="plain-list">
            {recurringExpenses.map(rec => (
              <li key={rec.id} className="list-row">
                <span className="list-row-label">{rec.name}</span>
                <span className="list-row-meta">{formatCurrency(rec.amount)}/mo</span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}
                  onClick={() => removeSubscription(rec.id)}
                  aria-label={`Remove ${rec.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import React from 'react';
import Header from './Header.jsx';

function BottomNav({ tabs, activeTab, onChange }) {
  return (
    <nav
      className="bottom-nav"
      aria-label="Primary tabs"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`bottom-nav-button ${activeTab === tab.id ? 'is-active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: tab.iconPath }}
          />
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function AppFrame({
  tabs,
  activeTab,
  onTabChange,
  userName,
  inboxCount,
  onOpenInbox,
  onOpenQuickAdd,
  onOpenSettings,
  showQuickAddFab = true,
  children,
}) {
  return (
    <div className={`app-shell${activeTab === 'calendar' ? ' app-shell--calendar' : ''}`}>
      <Header
        userName={userName}
        inboxCount={inboxCount}
        onOpenInbox={onOpenInbox}
        onOpenSettings={onOpenSettings}
      />

      <main className="app-content" aria-live="polite">
        <div className="app-page">{children}</div>
      </main>

      {showQuickAddFab && (
        <button
          type="button"
          className="fab-button"
          onClick={onOpenQuickAdd}
          aria-label="Quick Capture"
          title="Quick Capture"
        >
          +
        </button>
      )}

      <BottomNav tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
    </div>
  );
}

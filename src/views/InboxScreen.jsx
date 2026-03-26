import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppFrame from './components/AppFrame.jsx';
import InboxScreen from './views/InboxScreen.jsx';
// Removed: import InboxView from './components/InboxView.jsx';
import MoreScreen from './views/MoreScreen.jsx';
import TaskScreen from './views/TaskScreen.jsx';
import CalendarScreen from './views/CalendarScreen.jsx';
import FitnessScreen from './views/FitnessScreen.jsx';
import NoteScreen from './views/NoteScreen.jsx';
import { TaskProvider } from './context/TaskContext.jsx';

function AppShell() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [moreSection, setMoreSection] = useState(null);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

  function openMoreSection(sectionId) {
    setMoreSection(sectionId);
    setActiveTab('more');
  }

  function openInboxPage() {
    setMoreSection('inbox');
    setActiveTab('more');
    setNotificationCenterOpen(false);
  }

  return (
    <>
      <AppFrame
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenInbox={openInboxPage}
        // other props unchanged
      />
      {activeTab === 'more' && moreSection === 'inbox' && (
        <InboxScreen onSwitchToTab={setActiveTab} />
      )}
      {activeTab === 'more' && moreSection === 'settings' && <MoreScreen />}
      {activeTab === 'tasks' && <TaskScreen />}
      {activeTab === 'calendar' && <CalendarScreen />}
      {activeTab === 'fitness' && <FitnessScreen />}
      {activeTab === 'notes' && <NoteScreen />}
      {/* Removed entire <InboxView ... /> overlay render */}
    </>
  );
}

function App() {
  return (
    <TaskProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </TaskProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

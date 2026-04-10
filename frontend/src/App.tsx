import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScheduleForm from './pages/ScheduleForm';
import MBAList from './pages/MBAList';
import HolidayRecessList from './pages/HolidayRecessList';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mbas/*" element={<MBAList />} />
          <Route path="/holidays" element={<HolidayRecessList />} />
          <Route path="/generate" element={<ScheduleForm />} />
          <Route path="/settings" element={<div className="text-white">Configurações (Em breve)</div>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;

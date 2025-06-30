import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChatInterface } from './components/ChatInterface';
import { Layout } from './components/Layout';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<ChatInterface />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
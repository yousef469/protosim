import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { EditorPage } from './pages/Editor';
import { ModelHubPage } from './pages/ModelHub';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/models" element={<ModelHubPage />} />
      </Routes>
    </Router>
  );
}

export default App;

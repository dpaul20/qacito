import { BrowserRouter, Routes, Route, NavLink, useSearchParams } from 'react-router-dom';
import Home from './pages/Home.tsx';
import Run from './pages/Run.tsx';
import Plan from './pages/Plan.tsx';
import './App.css';

function AppShell() {
  const [params] = useSearchParams();
  const projectRoot = params.get('projectRoot');
  const search = projectRoot ? `?projectRoot=${encodeURIComponent(projectRoot)}` : '';

  return (
    <>
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-logo">9ea</span>
          <span className="nav-title">QAcito</span>
        </div>
        <div className="nav-links">
          <NavLink to={{ pathname: '/', search }} end className={({ isActive }) => isActive ? 'active' : ''}>Runs</NavLink>
          <NavLink to={{ pathname: '/plan', search }} className={({ isActive }) => isActive ? 'active' : ''}>Plan</NavLink>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/run/:id" element={<Run />} />
          <Route path="/plan" element={<Plan />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

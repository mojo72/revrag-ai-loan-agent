import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import { DiscoverPage } from './pages/Discover';
import { DocumentsPage } from './pages/Documents';
import { EligibilityPage } from './pages/Eligibility';
import { ReviewPage } from './pages/Review';
import { StepPage } from './pages/StepPage';
import { SubmittedPage } from './pages/Submitted';
import { RevragLayer } from './revrag/RevragLayer';
import { bindRouter } from './state/actions';

/** Lets the agent (outside React) navigate with the real router. */
function RouterBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    bindRouter((p) => navigate(p), () => window.location.pathname);
  }, [navigate]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouterBridge />
      <RevragLayer>
        <div className="min-h-dvh">
          <Header />
          <main className="mx-auto w-full max-w-3xl px-4 pb-40 pt-6 sm:px-6 lg:pb-16">
            <Routes>
              <Route path="/" element={<DiscoverPage />} />
              <Route path="/apply/loan" element={<StepPage step="loan" />} />
              <Route path="/apply/eligibility" element={<EligibilityPage />} />
              <Route path="/apply/personal" element={<StepPage step="personal" />} />
              <Route path="/apply/employment" element={<StepPage step="employment" />} />
              <Route path="/apply/address" element={<StepPage step="address" />} />
              <Route path="/apply/bank" element={<StepPage step="bank" />} />
              <Route path="/apply/documents" element={<DocumentsPage />} />
              <Route path="/apply/review" element={<ReviewPage />} />
              <Route path="/apply/submitted" element={<SubmittedPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </RevragLayer>
    </BrowserRouter>
  );
}

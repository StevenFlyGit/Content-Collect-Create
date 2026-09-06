import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import CapturePage from './pages/CapturePage.jsx'
import TimelinePage from './pages/TimelinePage.jsx'
import HotspotsPage from './pages/HotspotsPage.jsx'
import CreationBasketPage from './pages/CreationBasketPage.jsx'
import CreationSpacePage from './pages/CreationSpacePage.jsx'
import CreationFlowPage from './pages/CreationFlowPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/capture" element={<CapturePage />} />
      <Route path="/timeline" element={<TimelinePage />} />
      <Route path="/hotspots" element={<HotspotsPage />} />
      <Route path="/creation-basket" element={<CreationBasketPage />} />
      <Route path="/creation-space" element={<CreationSpacePage />} />
      <Route path="/creation/:creationId" element={<CreationFlowPage />} />
    </Routes>
  )
}

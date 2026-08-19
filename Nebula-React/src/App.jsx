import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import CapturePage from './pages/CapturePage.jsx'
import TimelinePage from './pages/TimelinePage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/capture" element={<CapturePage />} />
      <Route path="/timeline" element={<TimelinePage />} />
    </Routes>
  )
}

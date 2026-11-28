import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { Spinner } from './components/ui'
import { Apps } from './pages/Apps'
import { Home } from './pages/Home'
import { UpdatesPage } from './pages/Updates'

// the charts library is only needed on the System and Downloads pages
const SystemDashboard = lazy(() => import('./pages/SystemDashboard').then((m) => ({ default: m.SystemDashboard })))
const Downloads = lazy(() => import('./pages/Downloads').then((m) => ({ default: m.Downloads })))

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/system" element={<SystemDashboard />} />
            <Route path="/apps" element={<Apps />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route
              path="*"
              element={
                <div className="py-20 text-center">
                  <h1 className="text-2xl font-bold">This page does not exist</h1>
                  <a href="/" className="mt-3 inline-block text-accent hover:underline">
                    Back home
                  </a>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </Shell>
    </BrowserRouter>
  )
}

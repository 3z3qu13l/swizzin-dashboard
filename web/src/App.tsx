import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { Spinner } from './components/ui'
import { AppDashboard } from './pages/AppDashboard'

// the charts library is only needed on the System page
const SystemDashboard = lazy(() => import('./pages/SystemDashboard').then((m) => ({ default: m.SystemDashboard })))

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<AppDashboard />} />
            <Route path="/system" element={<SystemDashboard />} />
            <Route
              path="*"
              element={
                <div className="py-20 text-center">
                  <h1 className="text-2xl font-bold">This page does not exist</h1>
                  <a href="/" className="mt-3 inline-block text-accent hover:underline">
                    Back to your apps
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

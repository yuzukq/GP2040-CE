import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

// gp2040-neo: "/" is the neo GUI, everything else is the stock configurator.
// Both are loaded on demand so each page only gets its own stylesheet; links
// between the two do a full page load for the same reason.
const NeoApp = lazy(() => import('./Neo/NeoApp'));
const StockApp = lazy(() => import('./StockApp'));

const App = () => (
	<Router>
		<Suspense fallback={null}>
			<Routes>
				<Route path="/" element={<NeoApp />} />
				<Route path="*" element={<StockApp />} />
			</Routes>
		</Suspense>
	</Router>
);

export default App;

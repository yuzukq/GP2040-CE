// gp2040-neo: the stock GP2040-CE configurator. Loaded on demand so that its
// Bootstrap styles never reach the neo GUI (and the other way round).
import { Route, Routes } from 'react-router-dom';

import { AppContextProvider } from './Contexts/AppContext';

import Navigation from './Components/Navigation';

import HomePage from './Pages/HomePage';
import PinMappingPage from './Pages/PinMapping';
import PeripheralMappingPage from './Pages/PeripheralMappingPage';
import ResetSettingsPage from './Pages/ResetSettingsPage';
import SettingsPage from './Pages/SettingsPage';
import DisplayConfigPage from './Pages/DisplayConfig';
import AddonsConfigPage from './Pages/AddonsConfigPage';
import BackupPage from './Pages/BackupPage';
import PlaygroundPage from './Pages/PlaygroundPage';
import InputMacroAddonPage from './Pages/InputMacroAddonPage';
import ModShortcutPage from './Pages/ModShortcutPage';
import LedConfigPage from './Pages/LedConfigPage';

import './index.scss';
import './App.scss';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import BootModeMappingPage from './Pages/BootModeMapping';

const StockApp = () => (
	<AppContextProvider>
		<Navigation />
		<div className="body-content container-lg">
			<Routes>
				<Route path="/home" element={<HomePage />} />
				<Route path="/settings" element={<SettingsPage />} />
				<Route path="/pin-mapping" element={<PinMappingPage />} />
				<Route path="/boot-mode-mapping" element={<BootModeMappingPage />} />
				<Route path="/peripheral-mapping" element={<PeripheralMappingPage />} />
				<Route path="/reset-settings" element={<ResetSettingsPage />} />
				<Route path="/led-config" element={<LedConfigPage />} />
				<Route path="/display-config" element={<DisplayConfigPage />} />
				<Route path="/add-ons" element={<AddonsConfigPage />} />
				<Route path="/backup" element={<BackupPage />} />
				<Route path="/playground" element={<PlaygroundPage />} />
				<Route path="/macro" element={<InputMacroAddonPage />} />
				<Route path="/mod-shortcut" element={<ModShortcutPage />} />
				<Route path="*" element={<HomePage />} />
			</Routes>
		</div>
	</AppContextProvider>
);

export default StockApp;

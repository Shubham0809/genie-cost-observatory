import { createApp, analytics, server } from '@databricks/appkit';
import { registerBudgetRoutes } from './budget-api';

createApp({
  plugins: [analytics(), server()],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => registerBudgetRoutes(app));
  },
}).catch(console.error);

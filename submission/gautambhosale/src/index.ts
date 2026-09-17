import { SystemClock } from "./domain/clock.js";
import { composeBilling } from "./app/compose.js";
import { SilentNotifier } from "./notifications/notifier.js";
import { ConfigurablePaymentProvider } from "./payments/configurable-payment-provider.js";
import { seedFixtureCustomer } from "./persistence/seed.js";

const PORT = Number(process.env.PORT ?? 43177);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "test_webhook_secret";

const provider = new ConfigurablePaymentProvider();
const { repos, app } = composeBilling({
  provider,
  clock: new SystemClock(),
  notifier: new SilentNotifier(),
  webhookSecret: WEBHOOK_SECRET,
});
seedFixtureCustomer(repos.customers);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Subscription fixture listening on http://127.0.0.1:${PORT}`);
});

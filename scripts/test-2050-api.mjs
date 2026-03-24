#!/usr/bin/env node
/**
 * Smoke test for 2050 Materials API.
 * Run: npm run test:2050
 *
 * The value in MATERIALS_2050_API_TOKEN is the **developer token** from the account page.
 * This script exchanges it for a short-lived **api_token** via GET …/getapitoken/ (required
 * for /developer/api/* calls — see SDK docs).
 */
const BASE = "https://app.2050-materials.com/developer/api";

const developerToken = (process.env.MATERIALS_2050_API_TOKEN ?? "").trim();
if (!developerToken) {
  console.error(
    "Missing MATERIALS_2050_API_TOKEN. Set your developer token in .env (see .env.example).\n  npm run test:2050"
  );
  process.exit(1);
}

async function exchangeApiToken() {
  const url = `${BASE}/getapitoken/`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${developerToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `getapitoken failed ${res.status}: ${text.slice(0, 400)}`
    );
  }
  const j = JSON.parse(text);
  const api = j?.api_token;
  if (!api || typeof api !== "string") {
    throw new Error(`getapitoken: unexpected JSON keys: ${Object.keys(j)}`);
  }
  return api;
}

async function main() {
  console.log("2050 Materials API smoke test\n");

  const apiToken = await exchangeApiToken();
  const auth = { Authorization: `Bearer ${apiToken}` };

  // 1) Best match — closest to our IFC material → EPD linking idea
  const sampleLabels = [
    "03 Isolatie — PIR 100 mm",
    "Kooltherm K15",
  ];
  const bmUrl = `${BASE}/get_best_match`;
  console.log("POST", bmUrl);
  console.log("  input_items:", sampleLabels);
  let bmRes = await fetch(bmUrl, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ input_items: sampleLabels }),
  });
  const bmText = await bmRes.text();
  console.log("  status:", bmRes.status, bmRes.statusText);
  logBody(bmRes, bmText);

  // 2) Products (plan may restrict)
  const prodUrl = `${BASE}/get_products?product_type=5`;
  console.log("\nGET", prodUrl);
  let prodRes = await fetch(prodUrl, { headers: auth });
  const prodText = await prodRes.text();
  console.log("  status:", prodRes.status, prodRes.statusText);
  logBody(prodRes, prodText);

  // 3) Open products (limited GWP / A1–A3)
  const openUrl = `${BASE}/get_products_open_api`;
  console.log("\nGET", openUrl);
  let openRes = await fetch(openUrl, { headers: auth });
  const openText = await openRes.text();
  console.log("  status:", openRes.status, openRes.statusText);
  logBody(openRes, openText);

  console.log(
    "\nDone. `get_products_open_api` should be 200 on a normal developer setup."
  );
  console.log(
    "401 on `get_best_match` / `get_products` often means subscription not approved or plan lacks that endpoint — contact 2050 Materials."
  );
}

function logBody(res, text) {
  if (res.ok) {
    try {
      const j = JSON.parse(text);
      console.log("  keys:", j && typeof j === "object" ? Object.keys(j) : []);
      console.log("  body (truncated):", truncateJson(j));
    } catch {
      console.log("  body (raw, truncated):", text.slice(0, 500));
    }
  } else {
    console.log("  body (truncated):", text.slice(0, 800));
  }
}

function truncateJson(value, maxLen = 1200) {
  const s = JSON.stringify(value, null, 0);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}… (${s.length} chars total)`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
